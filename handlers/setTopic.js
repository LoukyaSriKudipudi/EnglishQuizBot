const { saveChat } = require("../utils/saveChat");
const bot = require("../utils/telegramBot");

module.exports = () => {
  bot.command("settopic", async (ctx) => {
    try {
      // 🔒 Block private chats
      if (ctx.chat.type === "private" || ctx.chat.id > 0) {
        try {
          const message = await ctx.reply(
            "❌ quizzes are not available in private chats."
          );
          setTimeout(async () => {
            try {
              await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id);
            } catch (err) {}
          }, 10000);
        } catch (err) {
          console.error("⚠ Failed to send private chat warning:", err.message);
        }
        return;
      }

      // 🧭 Extract chat info
      const chatId = ctx.chat.id;
      const chatTitle = ctx.chat.title || ctx.from.first_name || "Unknown Chat";
      const topicId = ctx.message?.message_thread_id || null;

      // 💾 Save chat safely
      try {
        await saveChat(chatId, topicId, chatTitle);
      } catch (err) {
        console.error("⚠ Failed to save chat:", err.message);
      }

      // 📨 Confirmation message
      try {
        if (topicId) {
          await ctx.reply("📝 This topic has been set for update!");
        } else {
          await ctx.reply(
            "📝 Updates will be sent to the main chat (no topic)."
          );
        }
      } catch (err) {
        console.error("⚠ Failed to send confirmation message:", err.message);
      }
    } catch (err) {
      console.error("🚨 /settopic command failed:", err.message);
    }
  });
};
