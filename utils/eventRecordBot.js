const { Telegraf } = require("telegraf");

const eventRecordBot = new Telegraf(process.env.EVENT_RECORD_BOT_TOKEN);

module.exports = eventRecordBot;
