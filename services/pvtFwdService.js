const bot = require("../utils/telegramBot");
const Chat = require("../models/chats");
const eventRecordBot = require("../utils/eventRecordBot");

const BROADCAST_GROUP_ID = Number(process.env.BROADCAST_NEWS_GROUP);
const BROADCAST_TOPIC_ID = Number(process.env.BROADCAST_NEWS_GROUP_TOPIC_ID);
const DELAY_PER_MESSAGE = 2000; // 2 seconds
const BATCH_SIZE = 100;
const ALLOWED_USER_ID = 6747845599; // Only this user can forward

// Fetch private chats in batches
async function getPrivateChatsBatch(skip = 0, limit = 100) {
  try {
    return await Chat.find({ chatId: { $gt: 0 } }) // private chats only
      .skip(skip)
      .limit(limit);
  } catch (err) {
    console.error("❌ Error fetching chat batch:", err);
    return [];
  }
}

// Record event logs safely (with splitting for long messages)
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
      await new Promise((res) => setTimeout(res, 500)); // delay
      await eventRecordBot.telegram.sendMessage(
        groupId,
        parts.length > 1
          ? `📄 Part ${index + 1}/${parts.length}\n\n${part}`
          : part,
        {
          ...(topicId ? { message_thread_id: topicId } : {}),
          parse_mode: "Markdown",
        }
      );
    }
  } catch (err) {
    if (err.response && err.response.error_code === 429) {
      const retryAfter = err.response.parameters.retry_after * 1000;
      console.log(`⏳ Rate limited. Waiting ${retryAfter} ms...`);
      await new Promise((res) => setTimeout(res, retryAfter));
      return recordEvent(message);
    }
    console.error("⚠ Failed to record event:", err.message);
  }
}

// Forward a message to all private chats (robust)
async function forwardMessageToPrivate(msg) {
  let skip = 0;
  const allSuccess = [];
  const allFailed = [];

  while (true) {
    const chats = await getPrivateChatsBatch(skip, BATCH_SIZE);
    if (!chats.length) break;

    const successBatch = [];
    const failedBatch = [];
    const logs = [];

    for (const { chatId, chatTitle, topicId } of chats) {
      try {
        await bot.telegram.copyMessage(chatId, msg.chat.id, msg.message_id, {
          ...(topicId ? { message_thread_id: topicId } : {}),
          protect_content: true,
        });

        logs.push(`✅ Forwarded to ${chatTitle}`);
        successBatch.push(chatTitle);
        allSuccess.push(chatTitle);
      } catch (err) {
        // Handle common Telegram errors
        if (err.response) {
          const code = err.response.error_code;
          if (code === 403) {
            logs.push(`⚠ Skipped ${chatTitle} (bot blocked or chat deleted)`);
          } else if (code === 429) {
            const retryAfter = err.response.parameters.retry_after * 1000;
            logs.push(`⏳ Rate limited. Waiting ${retryAfter / 1000}s...`);
            await new Promise((res) => setTimeout(res, retryAfter));
            continue; // retry same chat
          } else {
            logs.push(
              `❌ Failed for ${chatTitle}: ${err.response.description}`
            );
            failedBatch.push(chatTitle);
            allFailed.push(chatTitle);
          }
        } else {
          logs.push(`❌ Failed for ${chatTitle}: ${err.message}`);
          failedBatch.push(chatTitle);
          allFailed.push(chatTitle);
        }
      }

      await new Promise((res) => setTimeout(res, DELAY_PER_MESSAGE));
    }

    // Batch summary
    const now = new Date();
    const timestamp = now.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false,
    });
    await recordEvent(
      `📦 Batch completed at ${timestamp}\n` +
        `• ✅ Success: ${successBatch.length}\n` +
        `• ❌ Failed: ${failedBatch.length}\n` +
        `📝 Logs:\n${logs.join("\n")}`
    );

    skip += BATCH_SIZE;
  }

  // Final summary
  const now = new Date();
  const timestamp = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });
  await recordEvent(
    `✅ Finished forwarding at ${timestamp}\n` +
      `• ✅ Success: ${allSuccess.length}\n` +
      `• ❌ Failed: ${allFailed.length}`
  );
}

// /forward command
bot.command("pvtforward", async (ctx) => {
  const commandMsgId = ctx.message.message_id;

  try {
    await ctx.deleteMessage(commandMsgId);

    if (ctx.from.id !== ALLOWED_USER_ID) {
      return ctx.reply("❌ You are not authorized to use this command.");
    }

    if (!ctx.message.reply_to_message) {
      const errorMsg = await ctx.reply(
        "❌ Please reply to a valid message to forward."
      );
      setTimeout(() => ctx.deleteMessage(errorMsg.message_id), 5000);
      return;
    }

    const msg = ctx.message.reply_to_message;

    if (msg.chat.id !== BROADCAST_GROUP_ID) {
      const errorMsg = await ctx.reply(
        "❌ This message is not from the broadcast group."
      );
      setTimeout(() => ctx.deleteMessage(errorMsg.message_id), 5000);
      return;
    }

    if (BROADCAST_TOPIC_ID && msg.message_thread_id !== BROADCAST_TOPIC_ID) {
      const errorMsg = await ctx.reply(
        "❌ This message is not from the broadcast topic."
      );
      setTimeout(() => ctx.deleteMessage(errorMsg.message_id), 5000);
      return;
    }

    // Reply immediately
    await ctx.reply("⏳ Forwarding started… It may take a few minutes.");

    // Run in background (don’t await here)
    forwardMessageToPrivate(msg)
      .then(() => ctx.reply("✅ Forwarding completed!"))
      .catch((err) => {
        console.error("❌ Error in forwarding:", err);
        ctx.reply("⚠️ Forwarding failed.");
      });
  } catch (err) {
    console.error("❌ Error in command handler:", err);
    const errorMsg = await ctx.reply("⚠️ Something went wrong.");
    setTimeout(() => ctx.deleteMessage(errorMsg.message_id), 5000);
  }
});

module.exports = { forwardMessageToPrivate };
