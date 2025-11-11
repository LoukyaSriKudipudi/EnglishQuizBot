const { saveChat } = require("../utils/saveChat");
const { saveQuiz } = require("../utils/saveQuiz");
const { message } = require("telegraf/filters");
const bot = require("../utils/telegramBot");
const eventRecordBot = require("../utils/eventRecordBot");
const Chat = require("../models/chats");
const { Markup } = require("telegraf");

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
      // ✅ Only add link if public (has username)
      const publicLink = ctx.chat?.username
        ? `https://t.me/${ctx.chat.username}`
        : null;

      const MsgId = ctx.message?.message_id || null;

      function estimateGroupAge(msgId) {
        if (!Number.isInteger(msgId)) return "Unknown";
        if (msgId < 100) return "Brand-new 🍼";
        if (msgId < 500) return "New 🌱";
        if (msgId < 2000) return "Growing 🌿";
        return "Established 🌳";
      }

      const ageLabel = estimateGroupAge(MsgId);

      await eventRecordBot.telegram.sendMessage(
        process.env.EVENT_RECORD_NEW_START_ADD_GROUP_ID,
        `🌸 *English Grammar Bot* added to new group:\n` +
          `• *Title:* \`${safeChatTitle}\`\n` +
          `• *ID:* \`${chatID}\`\n` +
          `• *Type:* ${chatType}` +
          (publicLink
            ? `\n• *Group Visibility:* Public\n• *Link:* ${publicLink}`
            : `\n• *Group Visibility:* Private`) +
          `\n• *Message ID:* \`${MsgId ?? "N/A"}\`` +
          `\n• *Estimated Group Age:* ${ageLabel}` +
          (addedBy && addedBy.username !== "GroupAnonymousBot"
            ? `\n\n👤 *Added by:* \`${safeAddedByName}\` ${safeAddedByUsername}\n🆔 *User ID:* ${addedById}`
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
          } *${safeChatTitle}*! 🌸\n\n` +
            `🤖 I’ll share *quizzes 24/7* — perfect for daily practice and concept revision! 🚀\n\n` +
            `⚙️ Please make me an *admin* to unlock full features (settings, leaderboard, and quiz control).\n\n` +
            `⏱️ If quizzes ever stop, just use */startquiz* to resume.\n\n` +
            `💡 Use */settings* to customize:\n` +
            `• Quiz interval (1h, 2h, etc.)\n` +
            `• Enable/Disable old quiz deletion\n\n` +
            `📢 For updates, help & support — visit @LoukyaSri`,
          {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
              [
                Markup.button.url(
                  "➕ Add Me to Another Group",
                  `https://t.me/${ctx.botInfo.username}?startgroup&admin=promote_members+change_info+post_messages+edit_messages+delete_messages+invite_users+restrict_members+pin_messages+manage_video_chats+manage_topics`
                ),
              ],
              [
                Markup.button.url(
                  "🌐 Visit Website",
                  "https://loukyasri.netlify.app/"
                ),
                Markup.button.url("🤖 More Bots", "https://t.me/LoukyaSri"),
              ],
            ]),
          }
        );
      } catch (err) {
        if (
          err.response?.error_code === 400 ||
          err.response?.error_code === 403 ||
          err.message?.includes("not enough rights") ||
          err.message?.includes("can't send messages to the chat") ||
          err.message?.includes("CHAT_WRITE_FORBIDDEN") ||
          err.message?.includes("chat_write_forbidden") ||
          err.message?.includes("bot was blocked by the user") ||
          err.message.includes("bot was kicked") ||
          err.message.includes("kicked")
        ) {
          return;
        } else {
          console.log(
            `Error sending welcome message: \n${err.stack}\n\n Error Message: \n${err.message}`
          );
        }
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
              `⚠️ I work best with *admin privileges*. Without them, I switch to *limited mode* — no settings, no leaderboard, and fewer features.\n\n` +
              `⏱️ If quizzes ever stop, just use */startquiz* to resume.\n\n` +
              `⚙️ Open */settings in group* to manage quiz options:\n` +
              `• Default quiz interval: 1 hour\n` +
              `• Old quiz deletion: Enabled\n\n` +
              `📢 For *bot updates, tips & usage instructions*, visit @LoukyaSri`,
            { parse_mode: "Markdown" }
          );

          // Log DM event
          try {
            await eventRecordBot.telegram.sendMessage(
              process.env.EVENT_RECORD_NEW_START_ADD_GROUP_ID,
              `📩 *Private DM Sent*\n` +
                `• *User:* \`${safeAddedByName}\` ${safeAddedByUsername}\n` +
                `• *User ID:* \`${addedBy.id}\`\n` +
                `• *Group:* \`${safeChatTitle}\` (\`${chatID}\`)`,
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
                `• *User:* \`${safeAddedByName}\` ${safeAddedByUsername}\n` +
                `• *User ID:* \`${addedBy.id}\`\n` +
                `• *Group:* \`${safeChatTitle}\` (\`${chatID}\`)\n` +
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
            `• *Group:* \`${safeChatTitle}\` (\`${chatID}\`)\n` +
            `• *Reason:* The user who added the bot is anonymous and cannot receive DMs.`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.error("Error logging anonymous admin DM event:", err.message);
      }
    }
  });
};
