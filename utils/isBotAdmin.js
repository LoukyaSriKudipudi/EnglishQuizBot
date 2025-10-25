const bot = require("./telegramBot");

async function isBotAdmin(chatId) {
  try {
    const admins = await bot.telegram.getChatAdministrators(chatId);
    return admins.some((a) => a.user.is_bot && a.user.id === bot.botInfo.id);
  } catch (err) {
    console.warn(`⚠ Could not check admin in ${chatId}: ${err.message}`);
    return false;
  }
}

module.exports = isBotAdmin;
