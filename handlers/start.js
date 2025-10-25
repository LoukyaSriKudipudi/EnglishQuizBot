const { saveChat } = require("../utils/saveChat");
const bot = require("../utils/telegramBot");
const User = require("../models/userModel");
const { Markup } = require("telegraf");
const eventRecordBot = require("../utils/eventRecordBot");

// Escape Markdown for Telegram messages
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

module.exports = () => {
  bot.start(async (ctx) => {
    try {
      const chatType = ctx.chat.type;

      // Ignore /start in groups
      if (chatType === "group" || chatType === "supergroup") return;

      const chatId = ctx.chat.id;
      const chatTitle = ctx.chat.username || ctx.from.first_name;

      await saveChat(chatId, null, chatTitle);

      const { id, username, first_name, last_name } = ctx.from;
      const oldUser = await User.findOne({ telegramId: id });

      if (oldUser) {
        await User.updateOne(
          { telegramId: id },
          {
            $set: {
              username,
              firstName: first_name,
              lastName: last_name,
              lastActive: new Date(),
            },
          }
        );

        return ctx.reply(
          `👋 Welcome back, *${escapeMarkdown(first_name)}!*` +
            `\n\nGlad to see you again. Use */help* anytime to check available commands.\n\n` +
            `💡 Want a similar or custom bot? Contact */developer* or *@LoukyaSri*.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.url(
                  "➕ Add me to your Group",
                  `https://t.me/${ctx.botInfo.username}?startgroup&admin=promote_members+change_info+post_messages+edit_messages+delete_messages+invite_users+restrict_members+pin_messages+manage_video_chats+manage_topics`
                ),
              ],
            ]),
          }
        );
      }

      // New User (First time start)
      await User.create({
        telegramId: id,
        username,
        firstName: first_name,
        lastName: last_name,
        messages: [],
        lastActive: new Date(),
      });

      await ctx.reply(
        `🌸 I’m *English Grammar Quiz Bot*  \n\n` +
          `✅ I share *English Grammar Quizzes* every hour, 24/7 — for *SSC, Bank, RRB, and Other Competitive Exams.*  \n\n` +
          `📚 For *GS quizzes*, check *@LoukyaSriBot*, *@APPSCQuizBot* or *@TGPSCQuizBot*  \n\n` +
          `📚 For *Quant Reasoning*, check *MathsByLoukyaBot*  \n\n` +
          `👉 Use */help* command to explore my features ✨`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.url(
                "➕ Add me to your Group",
                `https://t.me/${ctx.botInfo.username}?startgroup&admin=promote_members+change_info+post_messages+edit_messages+delete_messages+invite_users+restrict_members+pin_messages+manage_video_chats+manage_topics`
              ),
            ],
          ]),
        }
      );

      // Event logging
      try {
        await eventRecordBot.telegram.sendMessage(
          process.env.EVENT_RECORD_NEW_START_ADD_GROUP_ID,
          `🆕 New user started the English Grammar Quiz bot:\n` +
            `• Username: \`${escapeMarkdown(username) || "No Username"}\`\n` +
            `• ID: \`${id}\`\n` +
            `• Firstname: \`${
              escapeMarkdown(first_name) || "No Firstname"
            }\`\n` +
            `• Lastname: \`${escapeMarkdown(last_name) || "No Lastname"}\``,
          {
            parse_mode: "Markdown",
            ...(process.env.EVENT_RECORD_NEW_START_ADD_GROUP_TOPIC_ID
              ? {
                  message_thread_id:
                    process.env.EVENT_RECORD_NEW_START_ADD_GROUP_TOPIC_ID,
                }
              : {}),
          }
        );
      } catch (err) {
        console.error("Error sending bot-added event:", err.message);
      }
    } catch (err) {
      console.error("Bot error:", err);
      ctx.reply("Something went wrong, try again later.");
    }
  });
};
