const mongoose = require("mongoose");

const DB = process.env.DATABASE.replace(
  "<db_password>",
  process.env.DATABASE_PASSWORD
);

async function connectDB() {
  try {
    await mongoose.connect(DB);
    console.log("---DB Connection Successful---");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    throw err;
  }
}

module.exports = connectDB;
