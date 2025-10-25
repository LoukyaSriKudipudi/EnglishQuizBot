const mongoose = require("mongoose");

const ChatSettingsSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  chatTitle: { type: String, required: true },
  joinHider: { type: Boolean, default: false },
  urlRemover: { type: Boolean, default: false },
});

module.exports = mongoose.model("ChatSettings", ChatSettingsSchema);
