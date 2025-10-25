require("dotenv").config();
const mongoose = require("mongoose");
const Chat = require("./models/chats");

const mongoUri = process.env.DATABASE.replace(
  "<db_password>",
  process.env.DATABASE_PASSWORD
);

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

async function resetQuizIndexes() {
  try {
    const chats = await Chat.find({ quizEnabled: true }).sort({
      createdAt: -1,
    });

    let index = 0;
    for (const chat of chats) {
      chat.quizIndex = index;
      await chat.save();
      index++;
    }

    console.log("✅ quizIndex updated successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error updating quizIndex:", err);
    process.exit(1);
  }
}

resetQuizIndexes();
