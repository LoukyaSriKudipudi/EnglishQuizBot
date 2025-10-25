const fs = require("fs");
const path = require("path");
const filePath = path.join(__dirname, "questions.json");
const outputPath = path.join(__dirname, "suffled-questions.json");

function suffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

try {
  const data = fs.readFileSync(filePath, "utf8");

  const questions = JSON.parse(data);

  if (!Array.isArray(questions)) {
    throw new Error("questions.join must contain a JSON array");
  }

  const suffled = suffleArray([...questions]);
  fs.writeFileSync(outputPath, JSON.stringify(suffled, null, 2), "utf8");
} catch (err) {
  console.error("❌ Error:", err.message);
}
