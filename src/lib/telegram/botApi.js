export async function sendTelegramMessage({ botToken, chatId, text, replyMarkup, parseMode = 'HTML' }) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
      ...(parseMode ? { parse_mode: parseMode } : {})
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`Telegram sendMessage failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function sendTelegramPhoto({ botToken, chatId, photo, caption = null, replyMarkup = null, parseMode = 'HTML' }) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo,
      ...(caption ? { caption } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      ...(caption && parseMode ? { parse_mode: parseMode } : {})
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`Telegram sendPhoto failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}
