const { exec } = require("child_process");
const bot = require("../utils/telegramBot");
bot.command("shutdownenglish", async (ctx) => {
  const adminId = 7665398753;
  if (ctx.from.id !== adminId) {
    return ctx.reply("❌ Unauthorized");
  }

  await ctx.reply("⚠️ Shutting down bot and pm2 process...");

  exec("pm2 stop englishbot", (err, stdout, stderr) => {
    if (err) {
      console.error(`Error stopping pm2: ${err.message}`);
      return;
    }
    console.log(stdout || stderr);
    process.exit(0);
  });
});
