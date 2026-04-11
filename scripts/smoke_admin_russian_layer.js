import { readFileSync } from 'node:fs';

const surfaceSource = readFileSync(new URL('../src/bot/surfaces/adminSurfaces.js', import.meta.url), 'utf8');
for (const fragment of ['👑 Админка', '🧰 Операции', '💬 Коммуникации', '⚙️ Система', 'Быстрые сигналы:', 'Готовые, но не опубликованы', 'Охват уведомления']) {
  if (!surfaceSource.includes(fragment)) {
    throw new Error(`Admin surface layer missing Russian fragment: ${fragment}`);
  }
}

const repoSource = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
for (const fragment of ['Подключили LinkedIn', 'Готовые, но не опубликованы', 'Опубликованы', 'Поиск пользователей']) {
  if (!repoSource.includes(fragment)) {
    throw new Error(`Admin repo labels missing Russian fragment: ${fragment}`);
  }
}

console.log('OK: admin Russian layer contract');
