import {
  generateObject,
  streamText,
  type ModelMessage,
} from "ai";
import { createOllama } from "ai-sdk-ollama";
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildCompanionPrompt } from "../../src/ai/prompts/companion.ts";
import { BOOKS } from "./fixtures/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK_ID = process.env["GLOSSE_EVAL_BOOK"] ?? "rust-atomics";
const FIXTURE = BOOKS[BOOK_ID];
if (!FIXTURE) {
  console.error(
    `[eval] unknown book "${BOOK_ID}". Available: ${Object.keys(BOOKS).join(", ")}`,
  );
  process.exit(1);
}
const QUESTIONS_PATH = path.join(__dirname, `questions/${BOOK_ID}.jsonl`);
const RESULTS_DIR = path.join(__dirname, "results");
const RUBRIC_PATH = path.join(__dirname, "rubric.md");

const OLLAMA_BASE_URL =
  process.env["OLLAMA_BASE_URL"] ?? "http://127.0.0.1:11434";
const ANSWERER_MODEL =
  process.env["GLOSSE_EVAL_ANSWERER"] ?? "gemma4:26b";
const JUDGE_MODEL =
  process.env["GLOSSE_EVAL_JUDGE"] ?? "qwen3:30b";

const ollama = createOllama({ baseURL: OLLAMA_BASE_URL });
const answerer = ollama(ANSWERER_MODEL, { think: false });
const SKIP_JUDGE = process.env["GLOSSE_EVAL_SKIP_JUDGE"] === "1";
const judge = SKIP_JUDGE ? null : ollama(JUDGE_MODEL, { think: false });

type IntentClass = "local" | "overview" | "future" | "broad" | "hybrid";

type EvalQuestion = {
  id: string;
  question: string;
  intentClass: IntentClass;
  expectedBehavior: string;
};

type EvalAnswer = {
  questionId: string;
  question: string;
  intentClass: IntentClass;
  answer: string;
  ttftMs: number;
  totalMs: number;
  chars: number;
};

const VerdictSchema = z.object({
  scores: z.object({
    frame: z.number().int().min(1).max(5),
    grounded: z.number().int().min(1).max(5),
    spoiler: z.number().int().min(1).max(5),
    voice: z.number().int().min(1).max(5),
    hybrid: z.number().int().min(1).max(5),
  }),
  mustFix: z.boolean(),
  headlineIssue: z.string().min(4),
  rewriteSuggestion: z.string().min(8),
});

type Verdict = z.infer<typeof VerdictSchema>;

function loadQuestions(): EvalQuestion[] {
  const raw = readFileSync(QUESTIONS_PATH, "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as EvalQuestion);
}

function loadRubric(): string {
  return readFileSync(RUBRIC_PATH, "utf-8");
}

async function answerQuestion(q: EvalQuestion): Promise<EvalAnswer> {
  const system = buildCompanionPrompt({
    bookTitle: FIXTURE.book.title,
    bookAuthor: FIXTURE.book.author,
    question: q.question,
    currentPage: FIXTURE.book.currentPage,
    totalPages: FIXTURE.book.totalPages,
    passages: FIXTURE.passages,
    spoilerProtection: true,
  });

  const startedAt = performance.now();
  let firstTokenAt = 0;
  let acc = "";
  const history: ModelMessage[] = [];
  const result = streamText({
    model: answerer,
    system,
    messages: [...history, { role: "user", content: q.question }],
  });
  for await (const delta of result.textStream) {
    if (firstTokenAt === 0) firstTokenAt = performance.now();
    acc += delta;
  }
  const finishedAt = performance.now();
  return {
    questionId: q.id,
    question: q.question,
    intentClass: q.intentClass,
    answer: acc,
    ttftMs: Math.round(firstTokenAt - startedAt),
    totalMs: Math.round(finishedAt - startedAt),
    chars: acc.length,
  };
}

async function judgeAnswer(
  q: EvalQuestion,
  a: EvalAnswer,
  rubric: string,
): Promise<Verdict> {
  const system = `You are an evaluator of AI-generated answers from a reading-companion app called glosse. Score the answer against the rubric strictly. The rubric is below verbatim. You MUST output a single JSON object matching the schema — no prose around it.

RUBRIC:
${rubric}

You will be given:
- the question the user asked
- the intent class assigned to the question
- the expected behavior the question's author wrote
- the actual answer the AI produced

Score each dimension 1–5 per the rubric. Set mustFix=true if any dimension is below 3. Write a one-sentence headlineIssue naming the single biggest problem (or "none" if 5/5/5/5/5). Write a concrete rewriteSuggestion: one or two sentences proposing how the answer's framing should change.

Be harsh on frame appropriateness. The user's named complaint is over-anchoring on book context for broad-knowledge questions. If the answer leads with "In the context of our reading" or "Within the scope of this book" for a broad question, frame score must be ≤2.`;

  const prompt = `Question: ${q.question}
Intent class: ${q.intentClass}
Expected behavior: ${q.expectedBehavior}

ACTUAL ANSWER:
${a.answer}`;

  if (!judge) throw new Error("judge disabled (GLOSSE_EVAL_SKIP_JUDGE=1)");
  const { object } = await generateObject({
    model: judge,
    schema: VerdictSchema,
    system,
    prompt,
    providerOptions: { ollama: { structuredOutputs: true } },
  });
  return object;
}

function meanScores(verdicts: Verdict[]): Verdict["scores"] {
  const sum = { frame: 0, grounded: 0, spoiler: 0, voice: 0, hybrid: 0 };
  for (const v of verdicts) {
    sum.frame += v.scores.frame;
    sum.grounded += v.scores.grounded;
    sum.spoiler += v.scores.spoiler;
    sum.voice += v.scores.voice;
    sum.hybrid += v.scores.hybrid;
  }
  const n = Math.max(1, verdicts.length);
  return {
    frame: +(sum.frame / n).toFixed(2),
    grounded: +(sum.grounded / n).toFixed(2),
    spoiler: +(sum.spoiler / n).toFixed(2),
    voice: +(sum.voice / n).toFixed(2),
    hybrid: +(sum.hybrid / n).toFixed(2),
  };
}

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(RESULTS_DIR, `${BOOK_ID}-${runId}`);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const questions = loadQuestions();
  const rubric = loadRubric();

  console.log(
    `[eval] book=${BOOK_ID} runId=${runId} answerer=${ANSWERER_MODEL} questions=${questions.length}`,
  );

  const answers: EvalAnswer[] = [];
  for (const q of questions) {
    process.stdout.write(`\n[answer] ${q.id} (${q.intentClass}) ... `);
    const startedAt = performance.now();
    try {
      const a = await answerQuestion(q);
      answers.push(a);
      console.log(
        `${(a.totalMs / 1000).toFixed(1)}s ttft=${(a.ttftMs / 1000).toFixed(1)}s chars=${a.chars}`,
      );
    } catch (err) {
      console.log(
        `FAIL: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    void startedAt;
  }
  writeFileSync(
    path.join(outDir, "answers.jsonl"),
    answers.map((a) => JSON.stringify(a)).join("\n") + "\n",
  );

  const verdicts: Array<{ questionId: string } & Verdict> = [];
  if (!SKIP_JUDGE) {
    for (const a of answers) {
      const q = questions.find((qq) => qq.id === a.questionId)!;
      process.stdout.write(`[judge] ${q.id} ... `);
      try {
        const v = await judgeAnswer(q, a, rubric);
        verdicts.push({ questionId: q.id, ...v });
        console.log(
          `frame=${v.scores.frame} ground=${v.scores.grounded} voice=${v.scores.voice} mustFix=${v.mustFix}`,
        );
      } catch (err) {
        console.log(
          `FAIL: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } else {
    console.log("\n[judge] skipped (GLOSSE_EVAL_SKIP_JUDGE=1)");
  }
  writeFileSync(
    path.join(outDir, "verdicts.jsonl"),
    verdicts.map((v) => JSON.stringify(v)).join("\n") + "\n",
  );

  const summary = {
    runId,
    answererModel: ANSWERER_MODEL,
    judgeModel: JUDGE_MODEL,
    questionCount: questions.length,
    answeredCount: answers.length,
    judgedCount: verdicts.length,
    meanScores: meanScores(verdicts),
    mustFixCount: verdicts.filter((v) => v.mustFix).length,
    perQuestion: verdicts.map((v) => {
      const q = questions.find((qq) => qq.id === v.questionId)!;
      const a = answers.find((aa) => aa.questionId === v.questionId)!;
      return {
        id: v.questionId,
        intentClass: q.intentClass,
        scores: v.scores,
        mustFix: v.mustFix,
        headlineIssue: v.headlineIssue,
        rewriteSuggestion: v.rewriteSuggestion,
        answerPreview: a.answer.slice(0, 200),
      };
    }),
  };
  writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );

  console.log("\n=== summary ===");
  console.log(`runId: ${runId}`);
  console.log(
    `answered: ${answers.length}/${questions.length}, judged: ${verdicts.length}, mustFix: ${summary.mustFixCount}`,
  );
  console.log(`mean scores:`, summary.meanScores);
  console.log(`output: ${outDir}`);
}

await main();
