export async function safeEditOrReply(ctx, text, other = {}) {
  const canEdit = Boolean(ctx.callbackQuery?.message);

  if (canEdit) {
    try {
      return await ctx.editMessageText(text, other);
    } catch (error) {
      const message = String(error?.message || error);
      const benign = message.includes('message is not modified') || message.includes('message to edit not found');
      if (!benign) {
        console.warn('[safeEditOrReply] edit failed, falling back to reply', message);
      }
    }
  }

  return ctx.reply(text, other);
}
 
