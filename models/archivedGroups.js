const mongoose = require("mongoose");

const archivedGroupSchema = new mongoose.Schema(
  {
    chatId: { type: Number, required: true, unique: true },
    chatTitle: { type: String },
    originalData: { type: Object, required: true },
    reason: { type: String, default: "Bot not admin" },
    archivedAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

module.exports = mongoose.model("ArchivedGroup", archivedGroupSchema);
