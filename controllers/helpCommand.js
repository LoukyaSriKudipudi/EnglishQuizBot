const bot = require("../utils/telegramBot");
const Chat = require("../models/chats");

bot.command("help", async (ctx) => {
  const chatId = ctx.chat.id;
  const topicId = ctx.message.message_thread_id;

  const helpMessage = `
🤖 *Available Commands*:

/startquiz  
_Enable quiz broadcasts._

/stopquiz  
_Disable quiz broadcasts._

/settopic  
_Set the topic for quiz broadcasts._

/myscore  
_View your personal quiz score._

/resetscore  
_Reset your quiz data and score._

/stats  
_View overall bot performance and activity._

/settings  
_Change quiz interval or manage old quiz deletion directly in the group._

/developer  
_View developer and bot information._

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
