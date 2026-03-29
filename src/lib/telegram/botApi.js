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
