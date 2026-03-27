import { cancelDirectoryFilterInputForTelegramUser } from '../../lib/storage/directoryFilterStore.js';
import { cancelProfileFieldEdit } from '../../lib/storage/profileEditStore.js';

export async function clearAllPendingInputs(telegramUserId) {
  await cancelProfileFieldEdit({ telegramUserId }).catch(() => null);
  await cancelDirectoryFilterInputForTelegramUser({ telegramUserId }).catch(() => null);
}
