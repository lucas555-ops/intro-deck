import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP039' });

const users = await surfaces.buildAdminSearchResultsSurface({
  scopeKey: 'users',
  state: {
    queryText: 'rustam',
    page: 0,
    pageSize: 8,
    totalCount: 1,
    hasPrev: false,
    hasNext: false,
    results: [{ userId: 9, telegramUserId: 111, telegramUsername: 'rustam', displayName: 'Rustam Lukmanov', hasLinkedIn: true, visibilityStatus: 'listed', profileState: 'active', pendingIntroCount: 1 }]
  }
});
const usersKeyboard = JSON.stringify(users.reply_markup.inline_keyboard);
if (!usersKeyboard.includes('adm:usr:open:9:all:0')) {
  throw new Error('User search results missing user-card drilldown');
}

const intros = await surfaces.buildAdminSearchResultsSurface({
  scopeKey: 'intros',
  state: {
    queryText: 'jane',
    page: 0,
    pageSize: 8,
    totalCount: 1,
    hasPrev: false,
    hasNext: false,
    results: [{ introRequestId: 12, requesterDisplayName: 'Rustam', targetDisplayName: 'Jane', status: 'pending', updatedAt: new Date().toISOString() }]
  }
});
if (!JSON.stringify(intros.reply_markup.inline_keyboard).includes('adm:intro:open:12:all:0')) {
  throw new Error('Intro search results missing intro drilldown');
}

const delivery = await surfaces.buildAdminSearchResultsSurface({
  scopeKey: 'delivery',
  state: {
    queryText: '42',
    page: 0,
    pageSize: 8,
    totalCount: 1,
    hasPrev: false,
    hasNext: false,
    results: [{ notificationReceiptId: 42, recipientDisplayName: 'Jane Doe', operatorBucket: 'failed', errorMessage: 'blocked' }]
  }
});
if (!JSON.stringify(delivery.reply_markup.inline_keyboard).includes('adm:dlv:open:42:all:0')) {
  throw new Error('Delivery search results missing delivery drilldown');
}

console.log('OK: admin search results contract');
