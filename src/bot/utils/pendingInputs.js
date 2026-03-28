import { cancelDirectoryFilterInputForTelegramUser } from '../../lib/storage/directoryFilterStore.js';
import { cancelAdminCommsEdit, cancelAdminUserNoteEdit } from '../../lib/storage/adminStore.js';
import { cancelProfileFieldEdit } from '../../lib/storage/profileEditStore.js';

export async function clearAllPendingInputs(telegramUserId) {
  await cancelProfileFieldEdit({ telegramUserId }).catch(() => null);
  await cancelDirectoryFilterInputForTelegramUser({ telegramUserId }).catch(() => null);
  await cancelAdminUserNoteEdit({ operatorTelegramUserId: telegramUserId }).catch(() => null);
  await cancelAdminCommsEdit({ operatorTelegramUserId: telegramUserId }).catch(() => null);
}
