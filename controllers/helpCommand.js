const bot = require("../utils/telegramBot");
const Chat = require("../models/chats");

bot.command("help", async (ctx) => {
  const chatId = ctx.chat.id;
  const topicId = ctx.message.message_thread_id;

  const helpMessage = `
🤖 *Available Commands*:

/startquiz  
_Enable fact and quizzes broadcasts in this chat_

/stopquiz  
_Disable fact and quizzes broadcasts in this chat_

/settopic
_Set topic for fact and quizzes broadcasts_

/developer  
_Show developer information_

/myscore
_Check your personal quiz score_

/resetscore
_Reset all your quiz data_

/stats  
_View bot performance_

/settings  
_Change quiz interval or toggle old quiz deletion directly in the group_

/help  
_Show this help message._
`;

  try {
    await bot.telegram.sendMessage(chatId, helpMessage, {
      ...(topicId ? { message_thread_id: topicId } : {}),
      parse_mode: "Markdown",
    });
  } catch (error) {
    if (
      error.description &&
      error.description.includes("message thread not found")
    ) {
      // fallback to sending in main chat
      await bot.telegram.sendMessage(chatId, helpMessage, {
        parse_mode: "Markdown",
      });
    } else {
      console.error("Unexpected error in /help command:", error);
    }
  }
});
