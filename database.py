#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Database and repository helpers for Roll Duel.

TDH-002 introduces a runtime backend abstraction:
- Postgres is the primary production backend when DATABASE_URL is set.
- SQLite remains available for local/dev compatibility and smoke tests.

The service/query layer intentionally keeps the existing DB-API style so that
handlers and services can move forward with minimal change surface.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import uuid
from pathlib import Path
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Iterator, List, Mapping, Optional

logger = logging.getLogger(__name__)

DATABASE_FILE = os.getenv("DATABASE_FILE", "dice_game.db")
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DATABASE_BACKEND = os.getenv("DATABASE_BACKEND", "postgres" if DATABASE_URL else "sqlite").strip().lower()
PLATFORM_USER_ID = 0
_MIGRATIONS_DIR = Path(__file__).resolve().parent / "storage" / "migrations"


def using_postgres() -> bool:
    return DATABASE_BACKEND == "postgres" and bool(DATABASE_URL)


class CompatRow(Mapping[str, Any]):
    def __init__(self, columns: list[str], values: Iterable[Any]):
        self._columns = list(columns)
        self._values = list(values)
        self._map = dict(zip(self._columns, self._values))

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return self._map[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._columns)

    def __len__(self) -> int:
        return len(self._columns)

    def get(self, key: str, default: Any = None) -> Any:
        return self._map.get(key, default)

    def items(self):
        return self._map.items()

    def keys(self):
        return self._map.keys()

    def values(self):
        return self._map.values()

    def __repr__(self) -> str:
        return f"CompatRow({self._map!r})"


_INSERT_OR_IGNORE_RE = re.compile(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+", re.IGNORECASE)


def _normalize_query(query: str) -> str:
    if _INSERT_OR_IGNORE_RE.match(query):
        query = _INSERT_OR_IGNORE_RE.sub("INSERT INTO ", query)
        query += " ON CONFLICT DO NOTHING"
    return query.replace("?", "%s")


class PGCursorWrapper:
    def __init__(self, conn_wrapper: "PGConnectionWrapper", cursor):
        self._conn_wrapper = conn_wrapper
        self._cursor = cursor
        self.lastrowid: Optional[int] = None

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    def execute(self, query: str, params: Optional[Iterable[Any]] = None):
        sql = _normalize_query(query)
        self._cursor.execute(sql, tuple(params or ()))
        self.lastrowid = None
        if query.lstrip().upper().startswith("INSERT INTO"):
            aux_cursor = None
            savepoint_name = f"sp_lastval_{uuid.uuid4().hex[:8]}"
            try:
                aux_cursor = self._conn_wrapper.raw.cursor()
                aux_cursor.execute(f"SAVEPOINT {savepoint_name}")
                aux_cursor.execute("SELECT LASTVAL()")
                row = aux_cursor.fetchone()
                if row:
                    self.lastrowid = row[0]
                aux_cursor.execute(f"RELEASE SAVEPOINT {savepoint_name}")
            except Exception:
                self.lastrowid = None
                if aux_cursor is not None:
                    try:
                        aux_cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                        aux_cursor.execute(f"RELEASE SAVEPOINT {savepoint_name}")
                    except Exception:
                        pass
            finally:
                if aux_cursor is not None:
                    try:
                        aux_cursor.close()
                    except Exception:
                        pass
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        cols = [desc[0] for desc in self._cursor.description]
        return CompatRow(cols, row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        if not rows:
            return []
        cols = [desc[0] for desc in self._cursor.description]
        return [CompatRow(cols, row) for row in rows]


class PGConnectionWrapper:
    def __init__(self, raw, autocommit: bool = False):
        self.raw = raw
        self.autocommit = autocommit

    def execute(self, query: str, params: Optional[Iterable[Any]] = None) -> PGCursorWrapper:
        cursor = PGCursorWrapper(self, self.raw.cursor())
        return cursor.execute(query, params)

    def cursor(self) -> PGCursorWrapper:
        return PGCursorWrapper(self, self.raw.cursor())

    def commit(self) -> None:
        self.raw.commit()

    def rollback(self) -> None:
        self.raw.rollback()

    def close(self) -> None:
        self.raw.close()


def get_connection():
    """Return a backend connection with dict-like row access."""
    if using_postgres():
        try:
            import psycopg
        except ImportError as exc:
            raise RuntimeError("psycopg is required when DATABASE_URL is set") from exc
        raw = psycopg.connect(DATABASE_URL, autocommit=False)
        return PGConnectionWrapper(raw)

    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction() -> Iterable[Any]:
    """Open a transaction for write flows."""
    conn = get_connection()
    try:
        if not using_postgres():
            conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@dataclass
class RuntimeJob:
    job_id: str
    job_type: str
    reference_type: str
    reference_id: str
    scheduled_for: datetime
    status: str
    attempt_count: int = 0
    last_error: Optional[str] = None


def _table_columns(conn, table_name: str) -> set[str]:
    if using_postgres():
        rows = conn.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?
            """,
            (table_name,),
        ).fetchall()
        return {row[0] if not isinstance(row, Mapping) else row["column_name"] for row in rows}
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def _add_column_if_missing(conn, table_name: str, column_name: str, definition: str) -> None:
    if column_name not in _table_columns(conn, table_name):
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {definition}")


def _ensure_user_exists(conn, user_id: int) -> None:
    row = conn.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        conn.execute(
            "INSERT INTO users (user_id, username, first_name) VALUES (?, ?, ?)",
            (user_id, None, None),
        )


def _available_balance_in_tx(conn, user_id: int) -> float:
    ledger_total = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries WHERE user_id = ?",
        (user_id,),
    ).fetchone()[0]
    reserved_total = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM balance_reservations WHERE user_id = ? AND status = 'active'",
        (user_id,),
    ).fetchone()[0]
    return round(float(ledger_total) - float(reserved_total), 8)


def _sync_user_balance_snapshot(conn, user_id: int) -> None:
    balance = _available_balance_in_tx(conn, user_id)
    conn.execute(
        "UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
        (balance, user_id),
    )


def _create_ledger_entry(
    conn,
    *,
    user_id: int,
    entry_type: str,
    amount: float,
    reference_type: Optional[str],
    reference_id: Optional[str],
    idempotency_key: str,
    meta_json: Optional[str] = None,
) -> str:
    existing = conn.execute(
        "SELECT entry_id FROM ledger_entries WHERE idempotency_key = ?",
        (idempotency_key,),
    ).fetchone()
    if existing:
        return existing[0]

    entry_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO ledger_entries (
            entry_id, user_id, entry_type, amount, asset, reference_type,
            reference_id, idempotency_key, meta_json
        ) VALUES (?, ?, ?, ?, 'TON', ?, ?, ?, ?)
        """,
        (
            entry_id,
            user_id,
            entry_type,
            float(amount),
            reference_type,
            reference_id,
            idempotency_key,
            meta_json,
        ),
    )
    return entry_id


def _create_reservation(
    conn,
    *,
    user_id: int,
    reservation_type: str,
    amount: float,
    reference_type: str,
    reference_id: str,
    idempotency_key: str,
) -> str:
    existing = conn.execute(
        "SELECT reservation_id FROM balance_reservations WHERE idempotency_key = ?",
        (idempotency_key,),
    ).fetchone()
    if existing:
        return existing[0]

    reservation_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO balance_reservations (
            reservation_id, user_id, reservation_type, amount, asset, status,
            reference_type, reference_id, idempotency_key
        ) VALUES (?, ?, ?, ?, 'TON', 'active', ?, ?, ?)
        """,
        (
            reservation_id,
            user_id,
            reservation_type,
            float(amount),
            reference_type,
            reference_id,
            idempotency_key,
        ),
    )
    return reservation_id


def _release_reservation(conn, reservation_id: Optional[str]) -> None:
    if not reservation_id:
        return
    conn.execute(
        """
        UPDATE balance_reservations
        SET status = 'released', released_at = CURRENT_TIMESTAMP
        WHERE reservation_id = ? AND status = 'active'
        """,
        (reservation_id,),
    )


def _consume_reservation(conn, reservation_id: Optional[str]) -> None:
    if not reservation_id:
        return
    conn.execute(
        """
        UPDATE balance_reservations
        SET status = 'consumed', released_at = CURRENT_TIMESTAMP
        WHERE reservation_id = ? AND status = 'active'
        """,
        (reservation_id,),
    )


def _bootstrap_ledger_from_legacy_balances(conn) -> None:
    rows = conn.execute("SELECT user_id, balance FROM users").fetchall()
    for row in rows:
        user_id = row["user_id"]
        balance = float(row["balance"] or 0)
        key = f"legacy-opening-balance:user:{user_id}"
        existing = conn.execute(
            "SELECT entry_id FROM ledger_entries WHERE idempotency_key = ?",
            (key,),
        ).fetchone()
        if existing or balance == 0:
            continue
        _create_ledger_entry(
            conn,
            user_id=user_id,
            entry_type="admin_adjustment",
            amount=balance,
            reference_type="legacy_balance",
            reference_id=str(user_id),
            idempotency_key=key,
            meta_json='{"migration":"legacy_users.balance"}',
        )
    for row in rows:
        _sync_user_balance_snapshot(conn, row["user_id"])


def _create_common_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id BIGINT PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                balance DOUBLE PRECISION DEFAULT 0,
                games_played INTEGER DEFAULT 0,
                games_won INTEGER DEFAULT 0,
                profit DOUBLE PRECISION DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                is_blocked INTEGER DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                risk_level TEXT DEFAULT 'normal',
                is_frozen INTEGER DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS games (
                game_id BIGSERIAL PRIMARY KEY,
                player1_id BIGINT,
                player2_id BIGINT,
                bet_amount DOUBLE PRECISION,
                status TEXT DEFAULT 'waiting',
                current_turn BIGINT,
                player1_roll INTEGER DEFAULT 0,
                player2_roll INTEGER DEFAULT 0,
                winner_id BIGINT,
                room_message_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMPTZ,
                player1_reservation_id TEXT,
                player2_reservation_id TEXT,
                settlement_id TEXT,
                status_reason TEXT,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                deadline_at TIMESTAMPTZ,
                last_state_change_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                workspace_id TEXT,
                FOREIGN KEY (player1_id) REFERENCES users (user_id),
                FOREIGN KEY (player2_id) REFERENCES users (user_id),
                FOREIGN KEY (winner_id) REFERENCES users (user_id)
            )
            """
        )
        # Production Postgres can already have an older pre-RD-MA-010/011 `games`
        # table. `CREATE TABLE IF NOT EXISTS` preserves that existing shape, so we
        # must reconcile schema drift before creating indexes that depend on newer
        # columns such as `workspace_id`.
        for column_name, definition in (
            ("player1_reservation_id", "player1_reservation_id TEXT"),
            ("player2_reservation_id", "player2_reservation_id TEXT"),
            ("settlement_id", "settlement_id TEXT"),
            ("status_reason", "status_reason TEXT"),
            ("updated_at", "updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"),
            ("deadline_at", "deadline_at TIMESTAMPTZ"),
            ("last_state_change_at", "last_state_change_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"),
            ("workspace_id", "workspace_id TEXT"),
        ):
            _add_column_if_missing(conn, "games", column_name, definition)

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS practice_balances (
                user_id BIGINT PRIMARY KEY,
                balance DOUBLE PRECISION NOT NULL DEFAULT 0,
                seeded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS practice_games (
                practice_game_id BIGSERIAL PRIMARY KEY,
                player1_id BIGINT NOT NULL,
                player2_id BIGINT,
                stake_amount DOUBLE PRECISION NOT NULL,
                status TEXT NOT NULL DEFAULT 'waiting',
                current_turn BIGINT,
                player1_roll INTEGER DEFAULT 0,
                player2_roll INTEGER DEFAULT 0,
                winner_id BIGINT,
                room_message_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                last_state_change_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                status_reason TEXT,
                FOREIGN KEY (player1_id) REFERENCES users (user_id),
                FOREIGN KEY (player2_id) REFERENCES users (user_id),
                FOREIGN KEY (winner_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT,
                amount DOUBLE PRECISION,
                transaction_type TEXT,
                game_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS invoices (
                id BIGSERIAL PRIMARY KEY,
                invoice_id TEXT UNIQUE,
                user_id BIGINT,
                amount DOUBLE PRECISION,
                status TEXT,
                pay_url TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                paid_at TIMESTAMPTZ,
                provider TEXT DEFAULT 'cryptopay',
                payload TEXT,
                idempotency_key TEXT UNIQUE,
                last_known_status TEXT,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS withdrawals (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT,
                amount DOUBLE PRECISION,
                status TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                transfer_id TEXT,
                error_message TEXT,
                spend_id TEXT,
                idempotency_key TEXT,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                name TEXT PRIMARY KEY,
                value TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ledger_entries (
                entry_id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                entry_type TEXT NOT NULL,
                amount DOUBLE PRECISION NOT NULL,
                asset TEXT NOT NULL DEFAULT 'TON',
                reference_type TEXT,
                reference_id TEXT,
                idempotency_key TEXT UNIQUE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                meta_json TEXT,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS balance_reservations (
                reservation_id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                reservation_type TEXT NOT NULL,
                amount DOUBLE PRECISION NOT NULL,
                asset TEXT NOT NULL DEFAULT 'TON',
                status TEXT NOT NULL,
                reference_type TEXT NOT NULL,
                reference_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                released_at TIMESTAMPTZ,
                idempotency_key TEXT UNIQUE NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_events (
                event_id TEXT PRIMARY KEY,
                provider TEXT NOT NULL DEFAULT 'cryptopay',
                provider_event_type TEXT NOT NULL,
                provider_object_id TEXT NOT NULL,
                provider_status TEXT NOT NULL,
                user_id BIGINT,
                amount DOUBLE PRECISION,
                asset TEXT,
                payload_json JSONB NOT NULL,
                signature_valid INTEGER DEFAULT 0,
                processed INTEGER DEFAULT 0,
                processed_at TIMESTAMPTZ,
                idempotency_key TEXT UNIQUE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS withdrawal_requests (
                withdrawal_id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                amount DOUBLE PRECISION NOT NULL,
                asset TEXT NOT NULL DEFAULT 'TON',
                status TEXT NOT NULL,
                reservation_id TEXT,
                provider_transfer_id TEXT,
                provider_spend_id TEXT,
                provider_status TEXT,
                error_message TEXT,
                operator_note TEXT,
                idempotency_key TEXT UNIQUE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                next_retry_at TIMESTAMPTZ,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telegram_updates (
                update_id BIGINT PRIMARY KEY,
                update_type TEXT NOT NULL,
                received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                processed INTEGER NOT NULL DEFAULT 0,
                processed_at TIMESTAMPTZ,
                payload_json JSONB NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runtime_jobs (
                job_id TEXT PRIMARY KEY,
                job_type TEXT NOT NULL,
                reference_type TEXT NOT NULL,
                reference_id TEXT NOT NULL,
                scheduled_for TIMESTAMPTZ NOT NULL,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                locked_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_runtime_states (
                user_id BIGINT PRIMARY KEY,
                state_key TEXT NOT NULL,
                state_payload_json JSONB,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMPTZ,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_games_status ON games (status)",
            "CREATE INDEX IF NOT EXISTS idx_games_deadline_at ON games (deadline_at)",
            "CREATE INDEX IF NOT EXISTS idx_games_workspace_id_finished_at ON games (workspace_id, finished_at)",
            "CREATE INDEX IF NOT EXISTS idx_practice_games_status ON practice_games (status)",
            "CREATE INDEX IF NOT EXISTS idx_practice_games_player1_id ON practice_games (player1_id)",
            "CREATE INDEX IF NOT EXISTS idx_practice_games_player2_id ON practice_games (player2_id)",
            "CREATE INDEX IF NOT EXISTS idx_payment_events_object_id ON payment_events (provider_object_id)",
            "CREATE INDEX IF NOT EXISTS idx_payment_events_processed ON payment_events (processed)",
            "CREATE INDEX IF NOT EXISTS idx_runtime_jobs_sched_status ON runtime_jobs (status, scheduled_for)",
            "CREATE INDEX IF NOT EXISTS idx_user_runtime_states_expires_at ON user_runtime_states (expires_at)",
            "CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests (status)",
        ):
            conn.execute(statement)
        return

    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            balance REAL DEFAULT 0,
            games_played INTEGER DEFAULT 0,
            games_won INTEGER DEFAULT 0,
            profit REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_blocked INTEGER DEFAULT 0
        )
        """
    )
    _add_column_if_missing(conn, "users", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    _add_column_if_missing(conn, "users", "risk_level", "risk_level TEXT DEFAULT 'normal'")
    _add_column_if_missing(conn, "users", "is_frozen", "is_frozen INTEGER DEFAULT 0")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS games (
            game_id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1_id INTEGER,
            player2_id INTEGER,
            bet_amount REAL,
            status TEXT DEFAULT 'waiting',
            current_turn INTEGER,
            player1_roll INTEGER DEFAULT 0,
            player2_roll INTEGER DEFAULT 0,
            winner_id INTEGER,
            room_message_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP,
            workspace_id TEXT,
            FOREIGN KEY (player1_id) REFERENCES users (user_id),
            FOREIGN KEY (player2_id) REFERENCES users (user_id),
            FOREIGN KEY (winner_id) REFERENCES users (user_id)
        )
        """
    )
    _add_column_if_missing(conn, "games", "player1_reservation_id", "player1_reservation_id TEXT")
    _add_column_if_missing(conn, "games", "player2_reservation_id", "player2_reservation_id TEXT")
    _add_column_if_missing(conn, "games", "settlement_id", "settlement_id TEXT")
    _add_column_if_missing(conn, "games", "status_reason", "status_reason TEXT")
    _add_column_if_missing(conn, "games", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    _add_column_if_missing(conn, "games", "deadline_at", "deadline_at TIMESTAMP")
    _add_column_if_missing(conn, "games", "last_state_change_at", "last_state_change_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    _add_column_if_missing(conn, "games", "workspace_id", "workspace_id TEXT")

    cursor.execute("SELECT seq FROM sqlite_sequence WHERE name = 'games'")
    row = cursor.fetchone()
    if row is None:
        cursor.execute("INSERT INTO sqlite_sequence (name, seq) VALUES ('games', 99)")
    elif row[0] < 99:
        cursor.execute("UPDATE sqlite_sequence SET seq = 99 WHERE name =  'games'")

    conn.execute("CREATE INDEX IF NOT EXISTS idx_games_workspace_id_finished_at ON games (workspace_id, finished_at)")


    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS practice_balances (
            user_id INTEGER PRIMARY KEY,
            balance REAL NOT NULL DEFAULT 0,
            seeded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS practice_games (
            practice_game_id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1_id INTEGER NOT NULL,
            player2_id INTEGER,
            stake_amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'waiting',
            current_turn INTEGER,
            player1_roll INTEGER DEFAULT 0,
            player2_roll INTEGER DEFAULT 0,
            winner_id INTEGER,
            room_message_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_state_change_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status_reason TEXT,
            FOREIGN KEY (player1_id) REFERENCES users (user_id),
            FOREIGN KEY (player2_id) REFERENCES users (user_id),
            FOREIGN KEY (winner_id) REFERENCES users (user_id)
        )
        """
    )

    conn.execute("CREATE INDEX IF NOT EXISTS idx_practice_games_status ON practice_games (status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_practice_games_player1_id ON practice_games (player1_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_practice_games_player2_id ON practice_games (player2_id)")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL,
            transaction_type TEXT,
            game_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id),
            FOREIGN KEY (game_id) REFERENCES games (game_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id TEXT UNIQUE,
            user_id INTEGER,
            amount REAL,
            status TEXT,
            pay_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paid_at TIMESTAMP
        )
        """
    )
    _add_column_if_missing(conn, "invoices", "provider", "provider TEXT DEFAULT 'cryptopay'")
    _add_column_if_missing(conn, "invoices", "payload", "payload TEXT")
    _add_column_if_missing(conn, "invoices", "idempotency_key", "idempotency_key TEXT")
    _add_column_if_missing(conn, "invoices", "last_known_status", "last_known_status TEXT")
    _add_column_if_missing(conn, "invoices", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL,
            status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            transfer_id TEXT,
            error_message TEXT
        )
        """
    )
    _add_column_if_missing(conn, "withdrawals", "spend_id", "spend_id TEXT")
    _add_column_if_missing(conn, "withdrawals", "idempotency_key", "idempotency_key TEXT")
    _add_column_if_missing(conn, "withdrawals", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            name TEXT PRIMARY KEY,
            value TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS ledger_entries (
            entry_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            entry_type TEXT NOT NULL,
            amount REAL NOT NULL,
            asset TEXT NOT NULL DEFAULT 'TON',
            reference_type TEXT,
            reference_id TEXT,
            idempotency_key TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            meta_json TEXT,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS balance_reservations (
            reservation_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            reservation_type TEXT NOT NULL,
            amount REAL NOT NULL,
            asset TEXT NOT NULL DEFAULT 'TON',
            status TEXT NOT NULL,
            reference_type TEXT NOT NULL,
            reference_id TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            released_at TIMESTAMP,
            idempotency_key TEXT UNIQUE NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS payment_events (
            event_id TEXT PRIMARY KEY,
            provider TEXT NOT NULL DEFAULT 'cryptopay',
            provider_event_type TEXT NOT NULL,
            provider_object_id TEXT NOT NULL,
            provider_status TEXT NOT NULL,
            user_id INTEGER,
            amount REAL,
            asset TEXT,
            payload_json TEXT NOT NULL,
            signature_valid INTEGER DEFAULT 0,
            processed INTEGER DEFAULT 0,
            processed_at TIMESTAMP,
            idempotency_key TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS withdrawal_requests (
            withdrawal_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            asset TEXT NOT NULL DEFAULT 'TON',
            status TEXT NOT NULL,
            reservation_id TEXT,
            provider_transfer_id TEXT,
            provider_spend_id TEXT,
            provider_status TEXT,
            error_message TEXT,
            operator_note TEXT,
            idempotency_key TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            next_retry_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS telegram_updates (
            update_id INTEGER PRIMARY KEY,
            update_type TEXT NOT NULL,
            received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            processed INTEGER NOT NULL DEFAULT 0,
            processed_at TIMESTAMP,
            payload_json TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_jobs (
            job_id TEXT PRIMARY KEY,
            job_type TEXT NOT NULL,
            reference_type TEXT NOT NULL,
            reference_id TEXT NOT NULL,
            scheduled_for TIMESTAMP NOT NULL,
            status TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            locked_at TIMESTAMP,
            completed_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user_runtime_states (
            user_id INTEGER PRIMARY KEY,
            state_key TEXT NOT NULL,
            state_payload_json TEXT,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )

    for statement in (
        "CREATE INDEX IF NOT EXISTS idx_games_status ON games (status)",
        "CREATE INDEX IF NOT EXISTS idx_games_deadline_at ON games (deadline_at)",
        "CREATE INDEX IF NOT EXISTS idx_practice_games_status ON practice_games (status)",
        "CREATE INDEX IF NOT EXISTS idx_practice_games_player1_id ON practice_games (player1_id)",
        "CREATE INDEX IF NOT EXISTS idx_practice_games_player2_id ON practice_games (player2_id)",
        "CREATE INDEX IF NOT EXISTS idx_payment_events_object_id ON payment_events (provider_object_id)",
        "CREATE INDEX IF NOT EXISTS idx_payment_events_processed ON payment_events (processed)",
        "CREATE INDEX IF NOT EXISTS idx_runtime_jobs_sched_status ON runtime_jobs (status, scheduled_for)",
        "CREATE INDEX IF NOT EXISTS idx_user_runtime_states_expires_at ON user_runtime_states (expires_at)",
        "CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests (status)",
    ):
        conn.execute(statement)


def _create_comms_tables(conn) -> None:
    if using_postgres():
        statements = [
            """
            CREATE TABLE IF NOT EXISTS broadcasts (
                broadcast_id TEXT PRIMARY KEY,
                created_by_operator_id TEXT NOT NULL,
                audience TEXT NOT NULL DEFAULT 'founder_test',
                status TEXT NOT NULL DEFAULT 'draft',
                message_text TEXT NOT NULL DEFAULT '',
                total_count INTEGER NOT NULL DEFAULT 0,
                sent_count INTEGER NOT NULL DEFAULT 0,
                failed_count INTEGER NOT NULL DEFAULT 0,
                last_sent_user_id BIGINT,
                started_at TIMESTAMPTZ,
                stopped_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS broadcast_deliveries (
                broadcast_id TEXT NOT NULL,
                user_id BIGINT NOT NULL,
                status TEXT NOT NULL DEFAULT 'sent',
                error_text TEXT,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                last_attempt_at TIMESTAMPTZ,
                next_retry_at TIMESTAMPTZ,
                delivered_at TIMESTAMPTZ,
                sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (broadcast_id, user_id),
                FOREIGN KEY (broadcast_id) REFERENCES broadcasts (broadcast_id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS system_notices (
                notice_id TEXT PRIMARY KEY,
                created_by_operator_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                target TEXT NOT NULL DEFAULT 'all_users',
                severity TEXT NOT NULL DEFAULT 'info',
                cta_key TEXT NOT NULL DEFAULT 'none',
                body_text TEXT NOT NULL DEFAULT '',
                version INTEGER NOT NULL DEFAULT 0,
                published_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS user_notice_seen (
                notice_id TEXT NOT NULL,
                user_id BIGINT NOT NULL,
                seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (notice_id, user_id),
                FOREIGN KEY (notice_id) REFERENCES system_notices (notice_id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_broadcasts_status_created_at ON broadcasts (status, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_retry ON broadcast_deliveries (broadcast_id, status, next_retry_at)",
            "CREATE INDEX IF NOT EXISTS idx_system_notices_status_published_at ON system_notices (status, published_at DESC)",
        ]
        for statement in statements:
            conn.execute(statement)
        for column_name, definition in (
            ("attempt_count", "attempt_count INTEGER NOT NULL DEFAULT 0"),
            ("last_attempt_at", "last_attempt_at TIMESTAMPTZ"),
            ("next_retry_at", "next_retry_at TIMESTAMPTZ"),
            ("delivered_at", "delivered_at TIMESTAMPTZ"),
        ):
            _add_column_if_missing(conn, "broadcast_deliveries", column_name, definition)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS broadcasts (
            broadcast_id TEXT PRIMARY KEY,
            created_by_operator_id TEXT NOT NULL,
            audience TEXT NOT NULL DEFAULT 'founder_test',
            status TEXT NOT NULL DEFAULT 'draft',
            message_text TEXT NOT NULL DEFAULT '',
            total_count INTEGER NOT NULL DEFAULT 0,
            sent_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_sent_user_id INTEGER,
            started_at TIMESTAMP,
            stopped_at TIMESTAMP,
            completed_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS broadcast_deliveries (
            broadcast_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'sent',
            error_text TEXT,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_attempt_at TIMESTAMP,
            next_retry_at TIMESTAMP,
            delivered_at TIMESTAMP,
            sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (broadcast_id, user_id),
            FOREIGN KEY (broadcast_id) REFERENCES broadcasts (broadcast_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_notices (
            notice_id TEXT PRIMARY KEY,
            created_by_operator_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            target TEXT NOT NULL DEFAULT 'all_users',
            severity TEXT NOT NULL DEFAULT 'info',
            cta_key TEXT NOT NULL DEFAULT 'none',
            body_text TEXT NOT NULL DEFAULT '',
            version INTEGER NOT NULL DEFAULT 0,
            published_at TIMESTAMP,
            expires_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_notice_seen (
            notice_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (notice_id, user_id),
            FOREIGN KEY (notice_id) REFERENCES system_notices (notice_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_broadcasts_status_created_at ON broadcasts (status, created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_retry ON broadcast_deliveries (broadcast_id, status, next_retry_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_system_notices_status_published_at ON system_notices (status, published_at DESC)")
    for column_name, definition in (
        ("attempt_count", "attempt_count INTEGER NOT NULL DEFAULT 0"),
        ("last_attempt_at", "last_attempt_at TIMESTAMP"),
        ("next_retry_at", "next_retry_at TIMESTAMP"),
        ("delivered_at", "delivered_at TIMESTAMP"),
    ):
        _add_column_if_missing(conn, "broadcast_deliveries", column_name, definition)


def _create_operator_truth_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS platform_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value_json JSONB NOT NULL,
                updated_by TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                note TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_risk_flags (
                flag_id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                flag_type TEXT NOT NULL,
                status TEXT NOT NULL,
                reason TEXT,
                created_by TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolved_by TEXT,
                resolved_at TIMESTAMPTZ,
                meta_json JSONB,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS operator_actions (
                action_id TEXT PRIMARY KEY,
                operator_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                reason TEXT,
                payload_json JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_user_risk_flags_user_status ON user_risk_flags (user_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_user_risk_flags_type_status ON user_risk_flags (flag_type, status)",
            "CREATE INDEX IF NOT EXISTS idx_operator_actions_target ON operator_actions (target_type, target_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_operator_actions_operator ON operator_actions (operator_id, created_at DESC)",
            "ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS review_status TEXT",
            "ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_by TEXT",
            "ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ",
            "ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS failure_class TEXT",
            "ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS last_operator_note TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ",
        ):
            conn.execute(statement)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS platform_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value_json TEXT NOT NULL,
            updated_by TEXT,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            note TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_risk_flags (
            flag_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            flag_type TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT,
            created_by TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_by TEXT,
            resolved_at TIMESTAMP,
            meta_json TEXT,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS operator_actions (
            action_id TEXT PRIMARY KEY,
            operator_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            reason TEXT,
            payload_json TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    _add_column_if_missing(conn, 'withdrawal_requests', 'review_status', 'review_status TEXT')
    _add_column_if_missing(conn, 'withdrawal_requests', 'reviewed_by', 'reviewed_by TEXT')
    _add_column_if_missing(conn, 'withdrawal_requests', 'reviewed_at', 'reviewed_at TIMESTAMP')
    _add_column_if_missing(conn, 'withdrawal_requests', 'failure_class', 'failure_class TEXT')
    _add_column_if_missing(conn, 'withdrawal_requests', 'last_operator_note', 'last_operator_note TEXT')
    _add_column_if_missing(conn, 'users', 'last_seen_at', 'last_seen_at TIMESTAMP')



def _create_miniapp_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS miniapp_sessions (
                session_id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                platform TEXT NOT NULL DEFAULT 'telegram-mini-app',
                start_param TEXT,
                query_id TEXT,
                app_version TEXT,
                init_hash_verified INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMPTZ,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_miniapp_sessions_user_id_created_at ON miniapp_sessions (user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_miniapp_sessions_expires_at ON miniapp_sessions (expires_at)",
        ):
            conn.execute(statement)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS miniapp_sessions (
            session_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            platform TEXT NOT NULL DEFAULT 'telegram-mini-app',
            start_param TEXT,
            query_id TEXT,
            app_version TEXT,
            init_hash_verified INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_miniapp_sessions_user_id_created_at ON miniapp_sessions (user_id, created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_miniapp_sessions_expires_at ON miniapp_sessions (expires_at)")


def _create_referral_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_referrals (
                referral_id TEXT PRIMARY KEY,
                referrer_user_id BIGINT NOT NULL,
                invited_user_id BIGINT NOT NULL UNIQUE,
                invite_code TEXT,
                source TEXT,
                start_param TEXT,
                status TEXT NOT NULL,
                invalid_reason TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                validated_at TIMESTAMPTZ,
                FOREIGN KEY (referrer_user_id) REFERENCES users (user_id),
                FOREIGN KEY (invited_user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS referral_events (
                event_id TEXT PRIMARY KEY,
                referral_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload_json TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referral_id) REFERENCES user_referrals (referral_id)
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer_user_id ON user_referrals (referrer_user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_referrals_invited_user_id ON user_referrals (invited_user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_referrals_invite_code ON user_referrals (invite_code)",
            "CREATE INDEX IF NOT EXISTS idx_referral_events_referral_id_created_at ON referral_events (referral_id, created_at DESC)",
        ):
            conn.execute(statement)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_referrals (
            referral_id TEXT PRIMARY KEY,
            referrer_user_id INTEGER NOT NULL,
            invited_user_id INTEGER NOT NULL UNIQUE,
            invite_code TEXT,
            source TEXT,
            start_param TEXT,
            status TEXT NOT NULL,
            invalid_reason TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            validated_at TIMESTAMP,
            FOREIGN KEY (referrer_user_id) REFERENCES users (user_id),
            FOREIGN KEY (invited_user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS referral_events (
            event_id TEXT PRIMARY KEY,
            referral_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload_json TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (referral_id) REFERENCES user_referrals (referral_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer_user_id ON user_referrals (referrer_user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_referrals_invited_user_id ON user_referrals (invited_user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_referrals_invite_code ON user_referrals (invite_code)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_referral_events_referral_id_created_at ON referral_events (referral_id, created_at DESC)")


def _create_wallet_link_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_links (
                wallet_link_id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                chain TEXT NOT NULL DEFAULT 'TON',
                wallet_address TEXT NOT NULL,
                normalized_address TEXT NOT NULL,
                status TEXT NOT NULL,
                is_primary INTEGER NOT NULL DEFAULT 1,
                linked_at TIMESTAMPTZ,
                unlinked_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                meta_json TEXT,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_wallet_links_user_id ON wallet_links (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_wallet_links_normalized_address ON wallet_links (normalized_address)",
            "CREATE INDEX IF NOT EXISTS idx_wallet_links_user_id_status ON wallet_links (user_id, status)",
        ):
            conn.execute(statement)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS wallet_links (
            wallet_link_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            chain TEXT NOT NULL DEFAULT 'TON',
            wallet_address TEXT NOT NULL,
            normalized_address TEXT NOT NULL,
            status TEXT NOT NULL,
            is_primary INTEGER NOT NULL DEFAULT 1,
            linked_at TIMESTAMP,
            unlinked_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            meta_json TEXT,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wallet_links_user_id ON wallet_links (user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wallet_links_normalized_address ON wallet_links (normalized_address)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wallet_links_user_id_status ON wallet_links (user_id, status)")





def _create_miniapp_client_smoke_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS miniapp_client_smoke_reports (
                report_id TEXT PRIMARY KEY,
                session_id TEXT,
                user_id BIGINT NOT NULL,
                app_env TEXT,
                shell_version TEXT,
                platform TEXT,
                telegram_version TEXT,
                color_scheme TEXT,
                viewport_height INTEGER,
                viewport_stable_height INTEGER,
                passed_count INTEGER NOT NULL DEFAULT 0,
                total_count INTEGER NOT NULL DEFAULT 0,
                outcome TEXT NOT NULL DEFAULT 'unknown',
                checks_json TEXT,
                logs_json TEXT,
                extra_json TEXT,
                issues_json TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_miniapp_client_smoke_reports_user_id_created_at ON miniapp_client_smoke_reports (user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_miniapp_client_smoke_reports_outcome_created_at ON miniapp_client_smoke_reports (outcome, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_miniapp_client_smoke_reports_session_id ON miniapp_client_smoke_reports (session_id)",
        ):
            conn.execute(statement)
        _add_column_if_missing(conn, "miniapp_client_smoke_reports", "issues_json", "issues_json TEXT")
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS miniapp_client_smoke_reports (
            report_id TEXT PRIMARY KEY,
            session_id TEXT,
            user_id INTEGER NOT NULL,
            app_env TEXT,
            shell_version TEXT,
            platform TEXT,
            telegram_version TEXT,
            color_scheme TEXT,
            viewport_height INTEGER,
            viewport_stable_height INTEGER,
            passed_count INTEGER NOT NULL DEFAULT 0,
            total_count INTEGER NOT NULL DEFAULT 0,
            outcome TEXT NOT NULL DEFAULT 'unknown',
            checks_json TEXT,
            logs_json TEXT,
            extra_json TEXT,
            issues_json TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_miniapp_client_smoke_reports_user_id_created_at ON miniapp_client_smoke_reports (user_id, created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_miniapp_client_smoke_reports_outcome_created_at ON miniapp_client_smoke_reports (outcome, created_at DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_miniapp_client_smoke_reports_session_id ON miniapp_client_smoke_reports (session_id)")
    _add_column_if_missing(conn, "miniapp_client_smoke_reports", "issues_json", "issues_json TEXT")


def _create_mission_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS missions_catalog (
                mission_id TEXT PRIMARY KEY,
                mission_code TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                target_value INTEGER NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_mission_progress (
                progress_id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                mission_id TEXT NOT NULL,
                progress_value INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                completed_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id),
                FOREIGN KEY (mission_id) REFERENCES missions_catalog (mission_id)
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_user_mission_progress_user_id ON user_mission_progress (user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_mission_progress_mission_id ON user_mission_progress (mission_id)",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mission_progress_user_id_mission_id ON user_mission_progress (user_id, mission_id)",
        ):
            conn.execute(statement)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS missions_catalog (
            mission_id TEXT PRIMARY KEY,
            mission_code TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            target_value INTEGER NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_mission_progress (
            progress_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            mission_id TEXT NOT NULL,
            progress_value INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            completed_at TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id),
            FOREIGN KEY (mission_id) REFERENCES missions_catalog (mission_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_mission_progress_user_id ON user_mission_progress (user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_user_mission_progress_mission_id ON user_mission_progress (mission_id)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mission_progress_user_id_mission_id ON user_mission_progress (user_id, mission_id)")


def _split_sql_statements(sql: str) -> list[str]:
    statements: list[str] = []
    buffer: list[str] = []
    for line in sql.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        buffer.append(line)
        if stripped.endswith(";"):
            statement = "\n".join(buffer).strip()
            if statement.endswith(";"):
                statement = statement[:-1]
            if statement:
                statements.append(statement)
            buffer = []
    trailing = "\n".join(buffer).strip()
    if trailing:
        statements.append(trailing[:-1] if trailing.endswith(";") else trailing)
    return statements


def _apply_runtime_sql_migrations(conn) -> None:
    if not using_postgres():
        return
    if not _MIGRATIONS_DIR.exists():
        return
    for path in sorted(_MIGRATIONS_DIR.glob("*.sql")):
        sql = path.read_text(encoding="utf-8")
        for statement in _split_sql_statements(sql):
            conn.execute(statement)


def _create_giveaway_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS giveaways (
                giveaway_id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                created_by_user_id BIGINT NOT NULL,
                title TEXT NOT NULL,
                prize_text TEXT NOT NULL,
                winners_count INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'DRAFT',
                starts_at TIMESTAMPTZ,
                ends_at TIMESTAMPTZ,
                published_message_id BIGINT,
                results_message_id BIGINT,
                draw_seed_version TEXT NOT NULL DEFAULT 'rd-bot-006.1:v1',
                draw_algo_version TEXT NOT NULL DEFAULT 'stable-hash-order:v1',
                pool_hash_method TEXT NOT NULL DEFAULT 'sha256:user-id-csv',
                winners_hash_method TEXT NOT NULL DEFAULT 'sha256:user-id-csv',
                drawn_at TIMESTAMPTZ,
                results_published_at TIMESTAMPTZ,
                canceled_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id),
                FOREIGN KEY (created_by_user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS giveaway_entries (
                entry_id TEXT PRIMARY KEY,
                giveaway_id TEXT NOT NULL,
                user_id BIGINT NOT NULL,
                joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_eligible INTEGER NOT NULL DEFAULT 1,
                eligibility_checked_at TIMESTAMPTZ,
                eligibility_reason TEXT,
                UNIQUE(giveaway_id, user_id),
                FOREIGN KEY (giveaway_id) REFERENCES giveaways (giveaway_id),
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS giveaway_winners (
                winner_id TEXT PRIMARY KEY,
                giveaway_id TEXT NOT NULL,
                user_id BIGINT NOT NULL,
                place INTEGER NOT NULL,
                selected_from TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(giveaway_id, place),
                UNIQUE(giveaway_id, user_id),
                FOREIGN KEY (giveaway_id) REFERENCES giveaways (giveaway_id),
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS giveaway_audit (
                audit_id TEXT PRIMARY KEY,
                giveaway_id TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                actor_user_id BIGINT,
                action TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (giveaway_id) REFERENCES giveaways (giveaway_id),
                FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id),
                FOREIGN KEY (actor_user_id) REFERENCES users (user_id)
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_giveaways_workspace_status ON giveaways (workspace_id, status, updated_at DESC)",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_giveaways_one_active_per_workspace ON giveaways (workspace_id) WHERE status = 'ACTIVE'",
            "CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_joined_at ON giveaway_entries (giveaway_id, joined_at, user_id)",
            "CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_eligible ON giveaway_entries (giveaway_id, is_eligible, joined_at)",
            "CREATE INDEX IF NOT EXISTS idx_giveaway_winners_giveaway_place ON giveaway_winners (giveaway_id, place)",
            "CREATE INDEX IF NOT EXISTS idx_giveaway_audit_giveaway_created_at ON giveaway_audit (giveaway_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_giveaway_audit_workspace_created_at ON giveaway_audit (workspace_id, created_at DESC)",
        ):
            conn.execute(statement)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS giveaways (
            giveaway_id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            created_by_user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            prize_text TEXT NOT NULL,
            winners_count INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            starts_at TIMESTAMP,
            ends_at TIMESTAMP,
            published_message_id INTEGER,
            results_message_id INTEGER,
            draw_seed_version TEXT NOT NULL DEFAULT 'rd-bot-006.1:v1',
            draw_algo_version TEXT NOT NULL DEFAULT 'stable-hash-order:v1',
            pool_hash_method TEXT NOT NULL DEFAULT 'sha256:user-id-csv',
            winners_hash_method TEXT NOT NULL DEFAULT 'sha256:user-id-csv',
            drawn_at TIMESTAMP,
            results_published_at TIMESTAMP,
            canceled_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id),
            FOREIGN KEY (created_by_user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS giveaway_entries (
            entry_id TEXT PRIMARY KEY,
            giveaway_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            is_eligible INTEGER NOT NULL DEFAULT 1,
            eligibility_checked_at TIMESTAMP,
            eligibility_reason TEXT,
            UNIQUE(giveaway_id, user_id),
            FOREIGN KEY (giveaway_id) REFERENCES giveaways (giveaway_id),
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS giveaway_winners (
            winner_id TEXT PRIMARY KEY,
            giveaway_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            place INTEGER NOT NULL,
            selected_from TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(giveaway_id, place),
            UNIQUE(giveaway_id, user_id),
            FOREIGN KEY (giveaway_id) REFERENCES giveaways (giveaway_id),
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS giveaway_audit (
            audit_id TEXT PRIMARY KEY,
            giveaway_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            actor_user_id INTEGER,
            action TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (giveaway_id) REFERENCES giveaways (giveaway_id),
            FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id),
            FOREIGN KEY (actor_user_id) REFERENCES users (user_id)
        )
        """
    )
    for statement in (
        "CREATE INDEX IF NOT EXISTS idx_giveaways_workspace_status ON giveaways (workspace_id, status, updated_at)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_giveaways_one_active_per_workspace ON giveaways (workspace_id) WHERE status = 'ACTIVE'",
        "CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_joined_at ON giveaway_entries (giveaway_id, joined_at, user_id)",
        "CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway_eligible ON giveaway_entries (giveaway_id, is_eligible, joined_at)",
        "CREATE INDEX IF NOT EXISTS idx_giveaway_winners_giveaway_place ON giveaway_winners (giveaway_id, place)",
        "CREATE INDEX IF NOT EXISTS idx_giveaway_audit_giveaway_created_at ON giveaway_audit (giveaway_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_giveaway_audit_workspace_created_at ON giveaway_audit (workspace_id, created_at)",
    ):
        conn.execute(statement)


def _create_workspace_tables(conn) -> None:
    if using_postgres():
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspaces (
                workspace_id TEXT PRIMARY KEY,
                telegram_chat_id BIGINT NOT NULL UNIQUE,
                chat_type TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_by_user_id BIGINT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                connected_at TIMESTAMPTZ,
                disconnected_at TIMESTAMPTZ
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspace_memberships (
                membership_id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                user_id BIGINT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(workspace_id, user_id),
                FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id),
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspace_settings (
                workspace_id TEXT PRIMARY KEY,
                post_duel_created_enabled INTEGER NOT NULL DEFAULT 0,
                post_duel_result_enabled INTEGER NOT NULL DEFAULT 0,
                leaderboard_posts_enabled INTEGER NOT NULL DEFAULT 0,
                weekly_summary_enabled INTEGER NOT NULL DEFAULT 0,
                default_leaderboard_scope TEXT NOT NULL DEFAULT 'chat',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id)
            )
            """
        )
        for column_name, definition in (
            ("leaderboard_posts_enabled", "leaderboard_posts_enabled INTEGER NOT NULL DEFAULT 0"),
            ("weekly_summary_enabled", "weekly_summary_enabled INTEGER NOT NULL DEFAULT 0"),
            ("default_leaderboard_scope", "default_leaderboard_scope TEXT NOT NULL DEFAULT 'chat'"),
        ):
            _add_column_if_missing(conn, "workspace_settings", column_name, definition)

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspace_connect_requests (
                request_id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                connect_token TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'pending',
                target_chat_id BIGINT,
                target_chat_title TEXT,
                target_chat_type TEXT,
                workspace_id TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                FOREIGN KEY (user_id) REFERENCES users (user_id),
                FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id)
            )
            """
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces (status, updated_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_id_status ON workspace_memberships (user_id, status, is_default)",
            "CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_id_status ON workspace_memberships (workspace_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_workspace_connect_requests_user_id_status ON workspace_connect_requests (user_id, status, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_workspace_connect_requests_expires_at ON workspace_connect_requests (expires_at)",
        ):
            conn.execute(statement)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workspaces (
            workspace_id TEXT PRIMARY KEY,
            telegram_chat_id INTEGER NOT NULL UNIQUE,
            chat_type TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_by_user_id INTEGER NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            connected_at TIMESTAMP,
            disconnected_at TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_memberships (
            membership_id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(workspace_id, user_id),
            FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id),
            FOREIGN KEY (user_id) REFERENCES users (user_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_settings (
            workspace_id TEXT PRIMARY KEY,
            post_duel_created_enabled INTEGER NOT NULL DEFAULT 0,
            post_duel_result_enabled INTEGER NOT NULL DEFAULT 0,
            leaderboard_posts_enabled INTEGER NOT NULL DEFAULT 0,
            weekly_summary_enabled INTEGER NOT NULL DEFAULT 0,
            default_leaderboard_scope TEXT NOT NULL DEFAULT 'chat',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id)
        )
        """
    )
    _add_column_if_missing(conn, "workspace_settings", "leaderboard_posts_enabled", "leaderboard_posts_enabled INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing(conn, "workspace_settings", "weekly_summary_enabled", "weekly_summary_enabled INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing(conn, "workspace_settings", "default_leaderboard_scope", "default_leaderboard_scope TEXT NOT NULL DEFAULT 'chat'")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_connect_requests (
            request_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            connect_token TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'pending',
            target_chat_id INTEGER,
            target_chat_title TEXT,
            target_chat_type TEXT,
            workspace_id TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            completed_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (user_id),
            FOREIGN KEY (workspace_id) REFERENCES workspaces (workspace_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces (status, updated_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_id_status ON workspace_memberships (user_id, status, is_default)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_id_status ON workspace_memberships (workspace_id, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_workspace_connect_requests_user_id_status ON workspace_connect_requests (user_id, status, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_workspace_connect_requests_expires_at ON workspace_connect_requests (expires_at)")

def _serialize_state_payload(payload: Optional[Mapping[str, Any] | dict | list | str | int | float | bool]) -> Optional[str]:
    if payload is None:
        return None
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _parse_state_payload(raw: Any) -> Any:
    if raw in (None, "", b""):
        return None
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return None


def _normalize_expiry(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.strftime("%Y-%m-%d %H:%M:%S")


def set_user_runtime_state(user_id: int, state_key: str, payload: Optional[Mapping[str, Any] | dict | list | str | int | float | bool] = None, ttl_seconds: Optional[int] = None) -> None:
    expires_at = None
    if ttl_seconds is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(int(ttl_seconds), 0))
    with transaction() as conn:
        _ensure_user_exists(conn, user_id)
        payload_json = _serialize_state_payload(payload)
        if using_postgres():
            conn.execute(
                """
                INSERT INTO user_runtime_states (user_id, state_key, state_payload_json, updated_at, expires_at)
                VALUES (?, ?, ?::jsonb, CURRENT_TIMESTAMP, ?)
                ON CONFLICT (user_id) DO UPDATE SET
                    state_key = EXCLUDED.state_key,
                    state_payload_json = EXCLUDED.state_payload_json,
                    updated_at = CURRENT_TIMESTAMP,
                    expires_at = EXCLUDED.expires_at
                """,
                (user_id, state_key, payload_json, _normalize_expiry(expires_at)),
            )
        else:
            conn.execute(
                """
                INSERT INTO user_runtime_states (user_id, state_key, state_payload_json, updated_at, expires_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    state_key = excluded.state_key,
                    state_payload_json = excluded.state_payload_json,
                    updated_at = CURRENT_TIMESTAMP,
                    expires_at = excluded.expires_at
                """,
                (user_id, state_key, payload_json, _normalize_expiry(expires_at)),
            )


def get_user_runtime_state(user_id: int) -> Optional[dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT user_id, state_key, state_payload_json, updated_at, expires_at FROM user_runtime_states WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        expires_at = row["expires_at"] if isinstance(row, Mapping) else row[4]
        if expires_at:
            try:
                expiry_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            except Exception:
                expiry_dt = None
            if expiry_dt is not None:
                if expiry_dt.tzinfo is None:
                    expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
                if expiry_dt <= datetime.now(timezone.utc):
                    conn.execute("DELETE FROM user_runtime_states WHERE user_id = ?", (user_id,))
                    conn.commit()
                    return None
        return {
            "user_id": int(row["user_id"]),
            "state_key": str(row["state_key"]),
            "payload": _parse_state_payload(row["state_payload_json"]),
            "updated_at": row["updated_at"],
            "expires_at": expires_at,
        }
    finally:
        conn.close()


def clear_user_runtime_state(user_id: int) -> None:
    with transaction() as conn:
        conn.execute("DELETE FROM user_runtime_states WHERE user_id = ?", (user_id,))


def cleanup_expired_user_runtime_states() -> int:
    with transaction() as conn:
        cursor = conn.execute(
            "DELETE FROM user_runtime_states WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP"
        )
        return int(getattr(cursor, "rowcount", 0) or 0)


def init_database() -> None:
    conn = get_connection()
    _create_common_tables(conn)
    _create_operator_truth_tables(conn)
    _create_comms_tables(conn)
    _create_miniapp_tables(conn)
    _create_referral_tables(conn)
    _create_wallet_link_tables(conn)
    _create_mission_tables(conn)
    _create_miniapp_client_smoke_tables(conn)
    _create_workspace_tables(conn)
    _create_giveaway_tables(conn)
    _apply_runtime_sql_migrations(conn)

    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (PLATFORM_USER_ID,))
    if not cursor.fetchone():
        cursor.execute(
            """
            INSERT INTO users (user_id, username, first_name, balance, profit)
            VALUES (?, 'platform', 'Roll Duel', 0, 0)
            """,
            (PLATFORM_USER_ID,),
        )

    for setting_name, default_value in (("allow_create_game", "1"), ("allow_withdraw", "1")):
        cursor.execute("SELECT value FROM settings WHERE name = ?", (setting_name,))
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO settings (name, value) VALUES (?, ?)",
                (setting_name, default_value),
            )

    _bootstrap_ledger_from_legacy_balances(conn)
    try:
        from services.settings import seed_platform_settings
        seed_platform_settings(conn)
    except Exception as exc:
        logger.warning("Failed to seed platform settings: %s", exc)
    try:
        from services.missions import seed_missions_catalog
        seed_missions_catalog(conn)
    except Exception as exc:
        logger.warning("Failed to seed missions catalog: %s", exc)
    conn.commit()
    conn.close()
    logger.info("Database initialized (%s backend)", DATABASE_BACKEND)


def create_or_update_user(user_id: int, username: str = None, first_name: str = None) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    row = cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if row:
        cursor.execute(
            """
            UPDATE users
            SET username = ?, first_name = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (username, first_name, user_id),
        )
    else:
        cursor.execute(
            "INSERT INTO users (user_id, username, first_name, last_seen_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (user_id, username, first_name),
        )
        logger.info("Created new user %s", user_id)
    conn.commit()
    conn.close()




def touch_user_last_seen(user_id: int) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()
    finally:
        conn.close()


def get_user_profile(user_id: int) -> Optional[dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT user_id, username, first_name, risk_level, is_frozen, is_blocked, last_seen_at, updated_at FROM users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_miniapp_session(
    *,
    user_id: int,
    start_param: Optional[str] = None,
    query_id: Optional[str] = None,
    app_version: Optional[str] = None,
    init_hash_verified: bool = False,
    expires_at: Optional[datetime] = None,
    platform: str = "telegram-mini-app",
) -> str:
    session_id = str(uuid.uuid4())
    with transaction() as conn:
        _ensure_user_exists(conn, user_id)
        conn.execute(
            """
            INSERT INTO miniapp_sessions (
                session_id, user_id, platform, start_param, query_id, app_version, init_hash_verified, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                user_id,
                platform,
                start_param,
                query_id,
                app_version,
                1 if init_hash_verified else 0,
                expires_at,
            ),
        )
        conn.execute(
            "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (user_id,),
        )
    return session_id


def touch_miniapp_session(session_id: str) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE miniapp_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = ?",
            (session_id,),
        )


def get_latest_miniapp_session(user_id: int) -> Optional[dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM miniapp_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_miniapp_session(session_id: str) -> Optional[dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM miniapp_sessions WHERE session_id = ? LIMIT 1",
            (session_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_referral_by_invited_user(invited_user_id: int) -> Optional[dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM user_referrals WHERE invited_user_id = ? LIMIT 1",
            (invited_user_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_user_referral(
    *,
    referrer_user_id: int,
    invited_user_id: int,
    invite_code: Optional[str],
    source: Optional[str],
    start_param: Optional[str],
    status: str,
    invalid_reason: Optional[str] = None,
) -> str:
    with transaction() as conn:
        existing = conn.execute(
            "SELECT referral_id FROM user_referrals WHERE invited_user_id = ?",
            (invited_user_id,),
        ).fetchone()
        if existing:
            return existing[0]
        _ensure_user_exists(conn, referrer_user_id)
        _ensure_user_exists(conn, invited_user_id)
        referral_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO user_referrals (
                referral_id, referrer_user_id, invited_user_id, invite_code, source, start_param, status, invalid_reason, validated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                referral_id,
                referrer_user_id,
                invited_user_id,
                invite_code,
                source,
                start_param,
                status,
                invalid_reason,
            ),
        )
        return referral_id


def create_referral_event(*, referral_id: str, event_type: str, payload_json: Optional[str] = None) -> str:
    event_id = str(uuid.uuid4())
    with transaction() as conn:
        conn.execute(
            "INSERT INTO referral_events (event_id, referral_id, event_type, payload_json) VALUES (?, ?, ?, ?)",
            (event_id, referral_id, event_type, payload_json),
        )
    return event_id


def get_referrals_for_referrer(referrer_user_id: int, limit: int = 10) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM user_referrals WHERE referrer_user_id = ? ORDER BY created_at DESC LIMIT ?",
            (referrer_user_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def count_referrals_for_referrer(referrer_user_id: int) -> int:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS total FROM user_referrals WHERE referrer_user_id = ?",
            (referrer_user_id,),
        ).fetchone()
        if not row:
            return 0
        return int(row[0] if not isinstance(row, Mapping) else row["total"])
    finally:
        conn.close()



def create_wallet_link(
    *,
    user_id: int,
    chain: str,
    wallet_address: str,
    normalized_address: str,
    status: str,
    is_primary: bool = True,
    meta_json: Optional[str] = None,
) -> str:
    wallet_link_id = str(uuid.uuid4())
    with transaction() as conn:
        _ensure_user_exists(conn, user_id)
        conn.execute(
            """
            INSERT INTO wallet_links (
                wallet_link_id, user_id, chain, wallet_address, normalized_address, status, is_primary, meta_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                wallet_link_id,
                user_id,
                chain,
                wallet_address,
                normalized_address,
                status,
                1 if is_primary else 0,
                meta_json,
            ),
        )
    return wallet_link_id


def get_wallet_link(wallet_link_id: str) -> Optional[dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM wallet_links WHERE wallet_link_id = ? LIMIT 1",
            (wallet_link_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_active_wallet_link_for_user(user_id: int) -> Optional[dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT * FROM wallet_links
            WHERE user_id = ? AND status IN ('pending_confirm', 'connected')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_active_wallet_link_by_normalized_address(normalized_address: str, *, exclude_wallet_link_id: Optional[str] = None) -> Optional[dict[str, Any]]:
    conn = get_connection()
    try:
        if exclude_wallet_link_id:
            row = conn.execute(
                """
                SELECT * FROM wallet_links
                WHERE normalized_address = ?
                  AND status IN ('pending_confirm', 'connected')
                  AND wallet_link_id <> ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (normalized_address, exclude_wallet_link_id),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT * FROM wallet_links
                WHERE normalized_address = ?
                  AND status IN ('pending_confirm', 'connected')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (normalized_address,),
            ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_wallet_link_status(
    *,
    wallet_link_id: str,
    status: str,
    set_linked_at: bool = False,
    set_unlinked_at: bool = False,
    meta_json: Optional[str] = None,
) -> None:
    with transaction() as conn:
        row = conn.execute(
            "SELECT meta_json FROM wallet_links WHERE wallet_link_id = ? LIMIT 1",
            (wallet_link_id,),
        ).fetchone()
        current_meta = None
        if row:
            current_meta = row[0] if not isinstance(row, Mapping) else row.get('meta_json')
        final_meta = meta_json if meta_json is not None else current_meta
        assignments = ["status = ?", "updated_at = CURRENT_TIMESTAMP", "meta_json = ?"]
        params: list[Any] = [status, final_meta]
        if set_linked_at:
            assignments.append("linked_at = CURRENT_TIMESTAMP")
        if set_unlinked_at:
            assignments.append("unlinked_at = CURRENT_TIMESTAMP")
        params.append(wallet_link_id)
        conn.execute(
            f"UPDATE wallet_links SET {', '.join(assignments)} WHERE wallet_link_id = ?",
            tuple(params),
        )

def get_user_balance(user_id: int) -> float:
    conn = get_connection()
    try:
        return _available_balance_in_tx(conn, user_id)
    finally:
        conn.close()


def update_user_balance(user_id: int, amount: float, reason: str = "admin_adjustment") -> None:
    with transaction() as conn:
        _ensure_user_exists(conn, user_id)
        idempotency_key = f"admin-adjustment:{user_id}:{uuid.uuid4()}"
        _create_ledger_entry(
            conn,
            user_id=user_id,
            entry_type="admin_adjustment",
            amount=float(amount),
            reference_type="admin_adjustment",
            reference_id=reason,
            idempotency_key=idempotency_key,
            meta_json=f'{{"reason":"{reason}"}}',
        )
        _sync_user_balance_snapshot(conn, user_id)


def get_user_stats(user_id: int) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT games_played, games_won FROM users WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    balance = _available_balance_in_tx(conn, user_id)
    conn.close()
    if row:
        games_played = row["games_played"]
        games_won = row["games_won"]
        return {
            "balance": balance,
            "games_played": games_played,
            "games_won": games_won,
            "win_rate": (games_won / games_played * 100) if games_played else 0,
        }
    return {"balance": 0.0, "games_played": 0, "games_won": 0, "win_rate": 0}


def get_waiting_games() -> List[dict]:
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT g.game_id, g.player1_id, g.bet_amount, u.first_name
        FROM games g
        JOIN users u ON g.player1_id = u.user_id
        WHERE g.status = 'waiting'
        ORDER BY g.created_at ASC
        """
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_game_by_id(game_id: int) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM games WHERE game_id = ?", (game_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_active_game(user_id: int) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute(
        """
        SELECT * FROM games
        WHERE (player1_id = ? OR player2_id = ?)
          AND status IN ('waiting', 'active', 'settling')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id, user_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_game_roll(game_id: int, user_id: int, roll_value: int) -> None:
    with transaction() as conn:
        game = conn.execute(
            "SELECT player1_id, player2_id FROM games WHERE game_id = ?",
            (game_id,),
        ).fetchone()
        if not game:
            raise ValueError(f"Game {game_id} not found")
        if game["player1_id"] == user_id:
            next_turn = game["player2_id"]
            conn.execute(
                """
                UPDATE games
                SET player1_roll = ?, current_turn = ?, updated_at = CURRENT_TIMESTAMP, last_state_change_at = CURRENT_TIMESTAMP
                WHERE game_id = ?
                """,
                (roll_value, next_turn, game_id),
            )
        else:
            next_turn = game["player1_id"]
            conn.execute(
                """
                UPDATE games
                SET player2_roll = ?, current_turn = ?, updated_at = CURRENT_TIMESTAMP, last_state_change_at = CURRENT_TIMESTAMP
                WHERE game_id = ?
                """,
                (roll_value, next_turn, game_id),
            )


def set_room_message_id(game_id: int, message_id: int) -> None:
    conn = get_connection()
    conn.execute(
        "UPDATE games SET room_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE game_id = ?",
        (message_id, game_id),
    )
    conn.commit()
    conn.close()


def get_room_message_id(game_id: int) -> Optional[int]:
    conn = get_connection()
    row = conn.execute("SELECT room_message_id FROM games WHERE game_id = ?", (game_id,)).fetchone()
    conn.close()
    return row[0] if row else None


def get_setting(name: str) -> Optional[str]:
    conn = get_connection()
    row = conn.execute("SELECT value FROM settings WHERE name = ?", (name,)).fetchone()
    conn.close()
    return row[0] if row else None


def log_withdrawal(
    user_id: int,
    amount: float,
    status: str,
    transfer_id: str = None,
    error_message: str = None,
    spend_id: str = None,
    idempotency_key: str = None,
) -> None:
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO withdrawals (user_id, amount, status, transfer_id, error_message, spend_id, idempotency_key, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        (user_id, amount, status, transfer_id, error_message, spend_id, idempotency_key),
    )
    conn.commit()
    conn.close()


def create_game(player1_id: int, bet_amount: float) -> int:
    from services.games import create_game_with_reservation
    result = create_game_with_reservation(player1_id, bet_amount)
    if not result["ok"]:
        raise ValueError(result["error"])
    return result["game_id"]


def join_game(game_id: int, player2_id: int) -> bool:
    from services.games import join_game_with_reservation
    result = join_game_with_reservation(game_id, player2_id)
    return bool(result["ok"])


def finish_game(game_id: int, winner_id: Optional[int]):
    from services.games import settle_game
    return settle_game(game_id, winner_id, reason="completed")


def cancel_game(game_id: int) -> bool:
    from services.games import cancel_waiting_game
    game = get_game_by_id(game_id)
    if not game:
        return False
    result = cancel_waiting_game(game_id, game["player1_id"])
    return bool(result["ok"])


def cancel_all_waiting_games() -> tuple[int, list[int]]:
    from services.games import cancel_all_waiting_games_service
    result = cancel_all_waiting_games_service()
    return result["count"], result["user_ids"]


def record_telegram_update(update_id: int, update_type: str, payload_json: str) -> bool:
    with transaction() as conn:
        existing = conn.execute("SELECT processed FROM telegram_updates WHERE update_id = ?", (update_id,)).fetchone()
        if existing:
            return False
        conn.execute(
            "INSERT INTO telegram_updates (update_id, update_type, payload_json, processed) VALUES (?, ?, ?, 0)",
            (update_id, update_type, payload_json),
        )
        return True


def mark_telegram_update_processed(update_id: int) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE telegram_updates SET processed = 1, processed_at = CURRENT_TIMESTAMP WHERE update_id = ?",
            (update_id,),
        )


def upsert_runtime_job(job_id: str, job_type: str, reference_type: str, reference_id: str, scheduled_for: datetime) -> None:
    if using_postgres():
        with transaction() as conn:
            conn.execute(
                """
                INSERT INTO runtime_jobs (job_id, job_type, reference_type, reference_id, scheduled_for, status)
                VALUES (?, ?, ?, ?, ?, 'pending')
                ON CONFLICT (job_id) DO UPDATE SET
                    job_type = EXCLUDED.job_type,
                    reference_type = EXCLUDED.reference_type,
                    reference_id = EXCLUDED.reference_id,
                    scheduled_for = EXCLUDED.scheduled_for,
                    status = CASE WHEN runtime_jobs.status = 'completed' THEN 'completed' ELSE 'pending' END,
                    last_error = NULL,
                    locked_at = NULL
                """,
                (job_id, job_type, reference_type, reference_id, scheduled_for),
            )
        return
    with transaction() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO runtime_jobs (job_id, job_type, reference_type, reference_id, scheduled_for, status, attempt_count, last_error, locked_at, completed_at, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', COALESCE((SELECT attempt_count FROM runtime_jobs WHERE job_id = ?), 0), NULL, NULL, NULL,
                    COALESCE((SELECT created_at FROM runtime_jobs WHERE job_id = ?), CURRENT_TIMESTAMP))
            """,
            (job_id, job_type, reference_type, reference_id, scheduled_for, job_id, job_id),
        )


def acquire_due_runtime_jobs(limit: int = 20) -> list[dict]:
    now = datetime.now(timezone.utc)
    with transaction() as conn:
        rows = conn.execute(
            """
            SELECT * FROM runtime_jobs
            WHERE status = 'pending' AND scheduled_for <= ?
            ORDER BY scheduled_for ASC
            LIMIT ?
            """,
            (now, limit),
        ).fetchall()
        jobs = [dict(row) for row in rows]
        for job in jobs:
            conn.execute(
                """
                UPDATE runtime_jobs
                SET status = 'processing',
                    attempt_count = attempt_count + 1,
                    locked_at = CURRENT_TIMESTAMP
                WHERE job_id = ?
                """,
                (job["job_id"],),
            )
        return jobs


def complete_runtime_job(job_id: str) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE runtime_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, last_error = NULL WHERE job_id = ?",
            (job_id,),
        )


def fail_runtime_job(job_id: str, error: str, retry_in_seconds: int = 60) -> None:
    next_time = datetime.now(timezone.utc) + timedelta(seconds=retry_in_seconds)
    with transaction() as conn:
        conn.execute(
            """
            UPDATE runtime_jobs
            SET status = 'pending',
                last_error = ?,
                scheduled_for = ?,
                locked_at = NULL
            WHERE job_id = ?
            """,
            (error[:500], next_time, job_id),
        )


def get_due_games_for_reconciliation(limit: int = 50) -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT * FROM games
            WHERE status IN ('waiting', 'active', 'settling')
              AND deadline_at IS NOT NULL
              AND deadline_at <= CURRENT_TIMESTAMP
            ORDER BY deadline_at ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
