const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, unique: true },
    username: String,
    firstName: String,
    lastName: String,
    messages: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        text: { type: String, maxlength: 250 },
        date: { type: Date, default: Date.now },
      },
    ],
    lastActive: Date,
  },
  { timestamps: true }
);

userSchema.pre(/^find/, function (next) {
  this.set({ lastActive: new Date() });
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
