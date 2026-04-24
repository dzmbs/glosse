import {
  generateObject,
  NoObjectGeneratedError,
  streamText,
  type ModelMessage,
} from "ai";
import { createOllama } from "ai-sdk-ollama";

import { buildCompanionPrompt } from "../src/ai/prompts/companion.ts";
import {
  QuizSchema,
  buildQuizSystemPrompt,
  buildQuizUserPrompt,
  FlashcardsSchema,
  buildFlashcardsSystemPrompt,
  buildFlashcardsUserPrompt,
  MindMapSchema,
  buildMindMapSystemPrompt,
  buildMindMapUserPrompt,
} from "../src/ai/prompts/study.ts";
import { STRUCTURED_OUTPUT_PROVIDER_OPTIONS } from "../src/ai/providers/registry.ts";
import { FIXTURE_BOOK, FIXTURE_PASSAGES } from "./fixture.ts";

/**
 * Local-model bench harness. Runs the same prompt-construction code the
 * app uses, against real Ollama, with canned retrieval passages — no DB,
 * no browser, no Zustand. The point is to iterate on prompts/schemas and
 * watch timings + raw outputs without waiting for a full app round-trip.
 *
 * Usage (after `npm install`):
 *   npm run bench:local
 *
 * Env overrides:
 *   OLLAMA_BASE_URL=http://127.0.0.1:11434   # default
 *   GLOSSE_BENCH_MODEL=gemma4:26b             # default
 *   GLOSSE_BENCH_ONLY=chat,quiz               # run only named scenarios
 *   GLOSSE_BENCH_THINK=true                   # leave Ollama "think" on
 */

const BASE_URL = process.env["OLLAMA_BASE_URL"] ?? "http://127.0.0.1:11434";
const MODEL_ID = process.env["GLOSSE_BENCH_MODEL"] ?? "gemma4:26b";
const THINK = process.env["GLOSSE_BENCH_THINK"] === "true";
const ONLY = (process.env["GLOSSE_BENCH_ONLY"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ollama = createOllama({ baseURL: BASE_URL });
const model = ollama(MODEL_ID, { think: THINK });

type ScenarioResult = {
  name: string;
  ok: boolean;
  ttftMs?: number;
  totalMs: number;
  outputChars?: number;
  notes: string[];
  rawOutput?: string;
  error?: string;
};

async function run(name: string, fn: () => Promise<ScenarioResult>): Promise<ScenarioResult> {
  if (ONLY.length > 0 && !ONLY.includes(name)) {
    return { name, ok: true, totalMs: 0, notes: ["skipped"] };
  }
  process.stdout.write(`\n[${name}] running…\n`);
  const startedAt = performance.now();
  try {
    const res = await fn();
    res.totalMs = res.totalMs || Math.round(performance.now() - startedAt);
    return res;
  } catch (err) {
    const totalMs = Math.round(performance.now() - startedAt);
    const notes: string[] = [];
    let rawOutput: string | undefined;
    if (NoObjectGeneratedError.isInstance(err)) {
      rawOutput = err.text ?? "";
      notes.push(`finish=${err.finishReason ?? "?"}`);
      notes.push(`tokens=${err.usage?.totalTokens ?? "?"}`);
    }
    return {
      name,
      ok: false,
      totalMs,
      error: err instanceof Error ? err.message : String(err),
      rawOutput,
      notes,
    };
  }
}

async function benchChat(): Promise<ScenarioResult> {
  const question = "thread vs scoped thread?";
  const system = buildCompanionPrompt({
    bookTitle: FIXTURE_BOOK.title,
    bookAuthor: FIXTURE_BOOK.author,
    question,
    currentPage: FIXTURE_BOOK.currentPage,
    totalPages: FIXTURE_BOOK.totalPages,
    passages: FIXTURE_PASSAGES,
    spoilerProtection: true,
  });

  const history: ModelMessage[] = [];
  const startedAt = performance.now();
  let firstTokenAt = 0;
  let acc = "";
  const result = streamText({
    model,
    system,
    messages: [...history, { role: "user", content: question }],
  });
  for await (const delta of result.textStream) {
    if (firstTokenAt === 0) firstTokenAt = performance.now();
    acc += delta;
  }
  const finishedAt = performance.now();
  return {
    name: "chat",
    ok: acc.length > 0,
    ttftMs: Math.round(firstTokenAt - startedAt),
    totalMs: Math.round(finishedAt - startedAt),
    outputChars: acc.length,
    notes: [
      `prompt≈${Math.round(system.length / 4)} tok`,
      `out≈${Math.round(acc.length / 4)} tok`,
    ],
    rawOutput: acc,
  };
}

async function benchQuiz(): Promise<ScenarioResult> {
  const system = buildQuizSystemPrompt({
    bookTitle: FIXTURE_BOOK.title,
    bookAuthor: FIXTURE_BOOK.author,
    scope: { kind: "all", maxPage: FIXTURE_BOOK.currentPage },
    difficulty: "medium",
    questionType: "mcq",
    passages: FIXTURE_PASSAGES,
  });
  const prompt = buildQuizUserPrompt({
    count: 5,
    difficulty: "medium",
    scope: { kind: "all", maxPage: FIXTURE_BOOK.currentPage },
    focusBits: [],
  });

  const { object } = await generateObject({
    model,
    schema: QuizSchema,
    system,
    prompt,
    providerOptions: STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
  });
  return {
    name: "quiz",
    ok: object.questions.length > 0,
    totalMs: 0,
    notes: [`questions=${object.questions.length}`],
    rawOutput: JSON.stringify(object, null, 2),
  };
}

async function benchFlashcards(): Promise<ScenarioResult> {
  const system = buildFlashcardsSystemPrompt({
    bookTitle: FIXTURE_BOOK.title,
    bookAuthor: FIXTURE_BOOK.author,
    scope: { kind: "all", maxPage: FIXTURE_BOOK.currentPage },
    difficulty: "medium",
    tone: "neutral",
    passages: FIXTURE_PASSAGES,
  });
  const prompt = buildFlashcardsUserPrompt({
    count: 5,
    difficulty: "medium",
    focusBits: [],
    scope: { kind: "all", maxPage: FIXTURE_BOOK.currentPage },
  });

  const { object } = await generateObject({
    model,
    schema: FlashcardsSchema,
    system,
    prompt,
    providerOptions: STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
  });
  return {
    name: "flashcards",
    ok: object.cards.length > 0,
    totalMs: 0,
    notes: [`cards=${object.cards.length}`],
    rawOutput: JSON.stringify(object, null, 2),
  };
}

async function benchMindmap(): Promise<ScenarioResult> {
  const sections = [
    {
      sectionIndex: 0,
      chapterTitle: "Basics of Rust Concurrency",
      excerpt: FIXTURE_PASSAGES.slice(0, 3)
        .map((p) => p.text)
        .join("\n\n---\n\n"),
    },
  ];
  const system = buildMindMapSystemPrompt({
    bookTitle: FIXTURE_BOOK.title,
    bookAuthor: FIXTURE_BOOK.author,
    maxPage: FIXTURE_BOOK.currentPage,
  });
  const prompt = buildMindMapUserPrompt({
    bookTitle: FIXTURE_BOOK.title,
    sections,
  });

  const { object } = await generateObject({
    model,
    schema: MindMapSchema,
    system,
    prompt,
    providerOptions: STRUCTURED_OUTPUT_PROVIDER_OPTIONS,
  });
  return {
    name: "mindmap",
    ok: object.branches.length > 0,
    totalMs: 0,
    notes: [
      `branches=${object.branches.length}`,
      `nodes=${object.branches.reduce((n, b) => n + b.nodes.length, 0)}`,
    ],
    rawOutput: JSON.stringify(object, null, 2),
  };
}

function printResult(r: ScenarioResult): void {
  const icon = r.ok ? "✓" : "✗";
  const ttft = r.ttftMs !== undefined ? ` ttft=${(r.ttftMs / 1000).toFixed(2)}s` : "";
  const chars = r.outputChars !== undefined ? ` chars=${r.outputChars}` : "";
  const notes = r.notes.length > 0 ? `  (${r.notes.join(" · ")})` : "";
  console.log(
    `  ${icon} ${r.name.padEnd(12)} ${(r.totalMs / 1000).toFixed(2).padStart(6)}s${ttft}${chars}${notes}`,
  );
  if (!r.ok && r.error) {
    console.log(`    error: ${r.error.split("\n")[0]}`);
  }
  if (!r.ok && r.rawOutput !== undefined) {
    const preview = r.rawOutput.slice(0, 800);
    console.log(`    raw: ${preview}${r.rawOutput.length > 800 ? "…" : ""}`);
  }
}

async function main(): Promise<void> {
  console.log(`glosse bench · model=${MODEL_ID} · baseURL=${BASE_URL} · think=${THINK}`);
  console.log(`fixture: "${FIXTURE_BOOK.title}" · ${FIXTURE_PASSAGES.length} passages`);

  const results: ScenarioResult[] = [];
  results.push(await run("chat", benchChat));
  results.push(await run("quiz", benchQuiz));
  results.push(await run("flashcards", benchFlashcards));
  results.push(await run("mindmap", benchMindmap));

  console.log(`\nresults:`);
  for (const r of results) printResult(r);

  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) process.exit(1);
}

await main();
