const { saveChat } = require("../utils/saveChat");
const { saveQuiz } = require("../utils/saveQuiz");
const { message } = require("telegraf/filters");
const bot = require("../utils/telegramBot");
const eventRecordBot = require("../utils/eventRecordBot");
const Chat = require("../models/chats");

// Utility function to check if user started the bot
async function hasUserStartedBot(userId) {
  try {
    const chatDoc = await Chat.findOne({ chatId: userId });
    return !!chatDoc;
  } catch (err) {
    console.error("Error checking user start:", err.message);
    return false;
  }
}

// Escape Markdown for Telegram messages
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

module.exports = () => {
  bot.on(message("new_chat_members"), async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    const botWasAdded = newMembers.some((m) => m.id === ctx.botInfo.id);

    const chatID = ctx.chat.id;
    const chatType = ctx.chat.type;
    const chatTitle = ctx.chat.title || ctx.from?.first_name || "Unknown Chat";

    // Save chat info
    try {
      await saveChat(chatID, null, chatTitle, null, chatType);
    } catch (err) {
      console.error("Error saving chat:", err.message);
    }

    if (!botWasAdded) return;

    // Save quiz info
    try {
      await saveQuiz(chatID, null, chatTitle, null, chatType);
    } catch (err) {
      console.error("Error saving quiz:", err.message);
    }

    const addedBy = ctx.from;
    const addedByName = addedBy
      ? `${addedBy.first_name}${
          addedBy.last_name ? " " + addedBy.last_name : ""
        }`
      : "";
    const addedByUsername = addedBy?.username ? "@" + addedBy.username : "";
    const addedById = addedBy?.id ? `\`${addedBy.id}\`` : "";

    // Send event log
    try {
      const safeChatTitle = escapeMarkdown(chatTitle);
      const safeAddedByName = escapeMarkdown(addedByName);
      const safeAddedByUsername = escapeMarkdown(addedByUsername);

      await eventRecordBot.telegram.sendMessage(
        process.env.EVENT_RECORD_NEW_START_ADD_GROUP_ID,
        `🌸 *English Grammar Bot* added to new group:\n` +
          `• *Title:* \`${safeChatTitle}\`\n` +
          `• *ID:* \`${chatID}\`\n` +
          `• *Type:* ${chatType}` +
          (addedBy && addedBy.username !== "GroupAnonymousBot"
            ? `\n\n👤 *Added by:* ${safeAddedByName} ${safeAddedByUsername}\n🆔 *User ID:* ${addedById}`
            : ""),
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("Error sending bot-added event:", err.message);
    }

    // Delay welcome message in group
    setTimeout(async () => {
      try {
        const addedByMention =
          addedBy && addedBy.username !== "GroupAnonymousBot"
            ? `${addedBy.first_name}${
                addedBy.last_name ? " " + addedBy.last_name : ""
              }`
            : "";
        const safeChatTitle = escapeMarkdown(chatTitle);

        await ctx.reply(
          `👋 Hi! ${
            addedByMention
              ? "Thanks " + addedByMention + " for adding me to"
              : "Thanks for adding me to"
          } *${safeChatTitle}*! 🥰\n\n` +
            `⚠️ I need *admin privileges* to post quizzes. Quizzes are *paused at 9 AM* if I’m not an admin. Run */startquiz* once I’m made admin.\n\n` +
            `🧠 I post quizzes 24/7 — perfect for practice and learning! 🚀\n\n` +
            `⚙️ You can open */settings* in this group to manage quiz options:\n` +
            `• Change *quiz interval*\n` +
            `• *Enable or disable* old quiz deletion\n\n`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.warn(
          "Cannot send welcome message. Bot might not have permission yet."
        );
      }
    }, 1500);

    // Send private DM to user if they started the bot
    if (addedBy?.id && addedBy.username !== "GroupAnonymousBot") {
      try {
        const started = await hasUserStartedBot(addedBy.id);
        const safeAddedByName = escapeMarkdown(addedByName);
        const safeChatTitle = escapeMarkdown(chatTitle);
        const safeAddedByUsername = escapeMarkdown(addedByUsername);

        if (started) {
          await bot.telegram.sendMessage(
            addedBy.id,
            `👋 Hi *${safeAddedByName}*! Thanks for adding me to *${safeChatTitle}*.\n\n` +
              `⚠️ I need *admin privileges* to post quizzes. Quizzes are *paused at 9 AM* if I’m not an admin. Run */startquiz* once I’m made admin.\n\n` +
              `⚙️ Open */settings in group* to manage quiz options:\n` +
              `• Default quiz interval: 1 hour\n` +
              `• Old quiz deletion: Enabled`,
            { parse_mode: "Markdown" }
          );

          // Log DM event
          try {
            await eventRecordBot.telegram.sendMessage(
              process.env.EVENT_RECORD_NEW_START_ADD_GROUP_ID,
              `📩 *Private DM Sent*\n` +
                `• *User:* ${safeAddedByName} ${safeAddedByUsername}\n` +
                `• *User ID:* \`${addedBy.id}\`\n` +
                `• *Group:* ${safeChatTitle} (\`${chatID}\`)`,
              { parse_mode: "Markdown" }
            );
          } catch (err) {
            console.error("Error logging private DM event:", err.message);
          }
        } else {
          // Record skipped DM
          try {
            await eventRecordBot.telegram.sendMessage(
              process.env.EVENT_RECORD_NEW_START_ADD_GROUP_ID,
              `⚠️ *DM Skipped*\n` +
                `• *User:* ${safeAddedByName} ${safeAddedByUsername}\n` +
                `• *User ID:* \`${addedBy.id}\`\n` +
                `• *Group:* ${safeChatTitle} (\`${chatID}\`)\n` +
                `• *Reason:* User has not started the bot yet.`,
              { parse_mode: "Markdown" }
            );
          } catch (err) {
            console.error("Error logging skipped DM event:", err.message);
          }
        }
      } catch (err) {
        console.error("Error sending private DM to adder:", err.message);
      }
    }

    // Anonymous admin
    if (addedBy?.username === "GroupAnonymousBot") {
      try {
        const safeChatTitle = escapeMarkdown(chatTitle);
        await eventRecordBot.telegram.sendMessage(
          process.env.EVENT_RECORD_NEW_START_ADD_GROUP_ID,
          `⚠️ *DM Skipped (Anonymous Admin)*\n` +
            `• *Group:* ${safeChatTitle} (\`${chatID}\`)\n` +
            `• *Reason:* The user who added the bot is anonymous and cannot receive DMs.`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.error("Error logging anonymous admin DM event:", err.message);
      }
    }
  });
};
