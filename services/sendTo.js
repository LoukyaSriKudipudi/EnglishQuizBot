const bot = require("../utils/telegramBot");
const eventRecordBot = require("../utils/eventRecordBot");

const ALLOWED_USER_ID = 7665398753;

// Event logging
async function recordEvent(message) {
  try {
    const groupId = Number(process.env.EVENT_RECORD_GROUP_ID);
    const topicId = Number(process.env.EVENT_RECORD_GROUP_TOPIC_ID);
    const MAX_LENGTH = 4000;

    const parts = [];
    for (let i = 0; i < message.length; i += MAX_LENGTH) {
      parts.push(message.slice(i, i + MAX_LENGTH));
    }

    for (const [index, part] of parts.entries()) {
      await new Promise((res) => setTimeout(res, 500));

      await eventRecordBot.telegram.sendMessage(
        groupId,
        parts.length > 1
          ? `📄 Part ${index + 1}/${parts.length}\n\n${part}`
          : part,
        {
          ...(topicId ? { message_thread_id: topicId } : {}),
        }
      );
    }
  } catch (err) {
    console.error("⚠ Failed to record event:", err.message);
  }
}

// /singlefwd <chatId1> <chatId2> ... command
bot.command("sendto", async (ctx) => {
  const commandMsgId = ctx.message.message_id;

  try {
    if (ctx.from.id !== ALLOWED_USER_ID) {
      return ctx.reply("❌ You are not authorized to use this command.");
    }

    const parts = ctx.message.text.split(" ").slice(1);
    if (!parts.length) {
      return ctx.reply(
        "❌ Please provide at least one chat ID. Usage: /sendto <chatId1> <chatId2> ..."
      );
    }

    if (!ctx.message.reply_to_message) {
      return ctx.reply("❌ Please reply to the message you want to forward.");
    }

    const msg = ctx.message.reply_to_message;
    const success = [];
    const failed = [];

    for (const idStr of parts) {
      const targetChatId = Number(idStr);
      if (isNaN(targetChatId)) {
        failed.push(`${idStr} (Invalid ID)`);
        continue;
      }

      try {
        await bot.telegram.copyMessage(
          targetChatId,
          msg.chat.id,
          msg.message_id,
          {
            protect_content: true,
          }
        );
        success.push(targetChatId);
      } catch (err) {
        failed.push(`${targetChatId} (${err.message})`);
      }

      // small delay to avoid hitting rate limits
      await new Promise((res) => setTimeout(res, 1000));
    }

    // Log event
    await recordEvent(
      `✅ Single forward by ${ctx.from.username || ctx.from.id}\n` +
        `• Success: ${success.length}\n` +
        `• Failed: ${failed.length}\n` +
        `📝 Details:\nSuccess: ${success.join(", ")}\nFailed: ${failed.join(
          ", "
        )}`
    );

    await ctx.reply(
      `✅ Forwarding completed!\n• Success: ${success.length}\n• Failed: ${failed.length}`
    );
  } catch (err) {
    console.error("❌ Error forwarding single message:", err);
    await ctx.reply("⚠️ Forward failed.");
  }
});
