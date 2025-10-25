const fs = require("fs");

// --- CONFIG LIMITS ---
const LIMITS = {
  question: 300,
  option: 100,
  explanation: 200,
};

// --- STEP 1: READ FILE ---
let data = JSON.parse(fs.readFileSync("suffled-questions.json", "utf8"));

// --- STEP 2: REMOVE DUPLICATES + FILTER BY LIMITS ---
const seen = new Set();
const filtered = [];

for (const q of data) {
  const question = (q.question || "").trim();
  const explanation = (q.explanation || "").trim();
  const options = q.options || [];

  // Skip if duplicate
  if (seen.has(question)) continue;
  seen.add(question);

  // Validate structure
  if (!question || !Array.isArray(options) || options.length !== 4) continue;

  // --- STEP 3: CHECK CHARACTER LIMITS ---
  const isQuestionValid = question.length <= LIMITS.question;
  const areOptionsValid = options.every(
    (opt) => opt.trim().length <= LIMITS.option
  );
  const isExplanationValid = explanation.length <= LIMITS.explanation;

  if (isQuestionValid && areOptionsValid && isExplanationValid) {
    filtered.push({
      question,
      options: options.map((o) => o.trim()),
      correct: q.correct,
      explanation,
    });
  }
}

// --- STEP 4: SAVE CLEAN FILE ---
fs.writeFileSync(
  "finalQuestions.json",
  JSON.stringify(filtered, null, 2),
  "utf8"
);

// --- STEP 5: REPORT ---
console.log(`✅ Total: ${data.length}`);
console.log(`🧹 Cleaned: ${filtered.length}`);
console.log(`💾 Saved as: questions_clean.json`);
