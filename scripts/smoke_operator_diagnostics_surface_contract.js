import { readFileSync } from "node:fs";
import { renderHomeKeyboard, renderOperatorDiagnosticsKeyboard, renderOperatorDiagnosticsText } from "../src/lib/telegram/render.js";

const envSource = readFileSync(new URL("../src/config/env.js", import.meta.url), "utf8");
if (!envSource.includes("OPERATOR_TELEGRAM_USER_IDS")) {
  throw new Error("Env config must expose OPERATOR_TELEGRAM_USER_IDS");
}
if (!envSource.includes("isOperatorTelegramUser")) {
  throw new Error("Env config must expose isOperatorTelegramUser");
}

const homeKeyboard = JSON.stringify(renderHomeKeyboard({
  appBaseUrl: "https://example.com",
  telegramUserId: 42,
  profileSnapshot: { linkedin_sub: "abc" },
  persistenceEnabled: true,
  isOperator: true
}).inline_keyboard);
if (!homeKeyboard.includes("ops:diag")) {
  throw new Error("Home keyboard must expose ops diagnostics entrypoint for operators");
}

const operatorText = renderOperatorDiagnosticsText({
  allowed: true,
  persistenceEnabled: true,
  diagnostics: {
    counts: { total: 4, sent: 1, retry_due: 1, failed: 1, exhausted: 1, skipped: 0 },
    recent: [
      { introRequestId: 11, eventType: "intro_request_created", operatorBucket: "retry_due", attemptCount: 1, maxAttempts: 3, nextAttemptAt: "2026-03-27T10:00:00.000Z", lastAttemptAt: "2026-03-27T09:55:00.000Z", createdAt: "2026-03-27T09:54:00.000Z", lastErrorCode: "telegram_rate_limited" }
    ]
  },
  hotRetryDue: [
    { introRequestId: 11, eventType: "intro_request_created", operatorBucket: "retry_due", attemptCount: 1, maxAttempts: 3, nextAttemptAt: "2026-03-27T10:00:00.000Z", lastAttemptAt: "2026-03-27T09:55:00.000Z", createdAt: "2026-03-27T09:54:00.000Z", lastErrorCode: "telegram_rate_limited" }
  ],
  hotFailed: [],
  hotExhausted: []
});
if (!operatorText.includes("Operator diagnostics")) {
  throw new Error("Operator diagnostics text must expose title");
}
if (!operatorText.includes("Retry due now:")) {
  throw new Error("Operator diagnostics text must surface retry due section");
}
if (!operatorText.includes("telegram_rate_limited")) {
  throw new Error("Operator diagnostics text must include last error code");
}

const operatorKeyboard = JSON.stringify(renderOperatorDiagnosticsKeyboard({
  allowed: true,
  bucket: null,
  diagnostics: { recent: [{ introRequestId: 11 }] },
  hotRetryDue: [{ introRequestId: 11 }],
  hotFailed: [{ introRequestId: 13 }],
  hotExhausted: []
}).inline_keyboard);
if (!operatorKeyboard.includes("ops:b:due")) {
  throw new Error("Operator keyboard must expose retry due filter");
}
if (!operatorKeyboard.includes("ops:i:11")) {
  throw new Error("Operator keyboard must expose intro drilldown buttons");
}

const createBotSource = readFileSync(new URL("../src/bot/createBot.js", import.meta.url), "utf8");
if (!createBotSource.includes("createOperatorComposer")) {
  throw new Error("Bot factory must register operator composer");
}

const composerSource = readFileSync(new URL("../src/bot/composers/operatorComposer.js", import.meta.url), "utf8");
if (!composerSource.includes("composer.command('ops'")) {
  throw new Error("Operator composer must expose /ops command");
}
if (!composerSource.includes("ops:b:(all|due|fal|exh)")) {
  throw new Error("Operator composer must expose bucket filter callbacks");
}

console.log("OK: lightweight operator/admin diagnostics surface contract");
