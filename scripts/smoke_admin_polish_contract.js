import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP040' });

const home = await surfaces.buildAdminHomeSurface({ summary: { totalUsers: 128, connectedUsers: 100, connectedNoProfile: 10, profileStartedUsers: 90, readyProfiles: 70, readyNotListed: 11, listedUsers: 42, listedActiveUsers: 33, noIntroYet: 19, firstIntroUsers: 17, acceptedIntroUsers: 9, failedDeliveries: 3, deliveryIssues: 3, pendingOlder24h: 5, activeNotice: true, latestBroadcastStatus: 'sent_with_failures' } });
for (const fragment of ['👑 Админка', 'Сначала раздел, затем тревоги', 'Готовы, но не опубликованы: 11', 'Уведомление: активно']) {
  if (!home.text.includes(fragment)) {
    throw new Error(`Admin home missing polished Russian fragment: ${fragment}`);
  }
}

const ops = await surfaces.buildAdminOperationsSurface({ summary: { totalUsers: 128, connectedUsers: 100, profileStartedUsers: 90, readyProfiles: 70, readyNotListed: 11, listedIncomplete: 2, deliveryIssues: 4, connectedNoProfile: 10, readyNoSkills: 7, listedActive: 33, listedInactive: 9, noIntroYet: 19, firstIntroUsers: 17, acceptedIntroUsers: 9, newIntros24h: 3, pendingOlder24h: 5, staleIntros: 1, recentRelinks7d: 2 } });
for (const fragment of ['🧰 Операции', 'Воронка: LinkedIn', 'Проблемы доставки: 4']) {
  if (!ops.text.includes(fragment)) {
    throw new Error(`Operations hub missing polished fragment: ${fragment}`);
  }
}

const source = readFileSync(new URL('../src/bot/surfaces/adminSurfaces.js', import.meta.url), 'utf8');
for (const fragment of ['В этом сегменте сейчас нет пользователей.', 'В этом сегменте качества сейчас нет профилей.', 'В этом сегменте аудита пока нет событий.']) {
  if (!source.includes(fragment)) {
    throw new Error(`Admin surfaces missing Russian empty-state copy: ${fragment}`);
  }
}

console.log('OK: admin polish contract');
