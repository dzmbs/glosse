import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { GLOSSE_EVAL_SEED } from "@/ai/evals/seed";
import {
  listIndexedEvalBooks,
  resolveEvalCases,
  runAnswerEval,
  runRetrievalEval,
} from "@/ai/evals/runner";
import type { EvalRunResult, IndexedEvalBook, ResolvedEvalCase } from "@/ai/evals/types";
import { useAISettings } from "@/ai/providers/settings";
import { Icon } from "@/components/Icons";

type ResultMap = Record<string, EvalRunResult>;

export function EvalsPage() {
  const settings = useAISettings();
  const [books, setBooks] = useState<IndexedEvalBook[]>([]);
  const [results, setResults] = useState<ResultMap>({});
  const [loading, setLoading] = useState(false);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadBooks = useCallback(async () => {
    setError(null);
    try {
      const indexed = await listIndexedEvalBooks();
      setBooks(indexed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reloadBooks();
  }, [reloadBooks]);

  const resolved = useMemo(
    () => resolveEvalCases(GLOSSE_EVAL_SEED, books),
    [books],
  );
  const matched = resolved.filter(
    (item): item is Extract<ResolvedEvalCase, { resolution: "matched" }> =>
      item.resolution === "matched",
  );
  const unresolved = resolved.filter((item) => item.resolution !== "matched");

  const summary = useMemo(() => {
    const completed = Object.values(results);
    const retrievalDone = completed.length;
    const spoilerSafe = completed.filter((r) => r.retrieval.spoilerSafe).length;
    const preferredApplicable = completed.filter(
      (r) => r.retrieval.top1Preferred !== null,
    ).length;
    const preferredTop1 = completed.filter(
      (r) => r.retrieval.top1Preferred === true,
    ).length;
    const answerDone = completed.filter((r) => r.answer).length;
    const answerChecksOk = completed.filter(
      (r) =>
        r.answer &&
        r.answer.citedSpoilerSafe &&
        r.answer.requiredSubstringsOk &&
        r.answer.forbiddenSubstringsOk,
    ).length;
    return {
      retrievalDone,
      spoilerSafe,
      preferredApplicable,
      preferredTop1,
      answerDone,
      answerChecksOk,
    };
  }, [results]);
  const preferredTop1Value =
    summary.preferredApplicable === 0
      ? "n/a"
      : `${summary.preferredTop1}/${summary.preferredApplicable}`;

  const runRetrievalSuite = useCallback(async () => {
    setLoading(true);
    setError(null);
    const next: ResultMap = {};
    try {
      for (const item of matched) {
        const retrieval = await runRetrievalEval(item, {
          maxContextChunks: settings.maxContextChunks,
        });
        next[item.source.id] = {
          caseId: item.source.id,
          retrieval,
        };
        setResults({ ...next });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [matched, settings.maxContextChunks]);

  const runAnswerSuite = useCallback(async () => {
    setAnswerLoading(true);
    setError(null);
    const next: ResultMap = { ...results };
    try {
      for (const item of matched) {
        const existing = next[item.source.id];
        const retrieval =
          existing?.retrieval ??
          (await runRetrievalEval(item, {
            maxContextChunks: settings.maxContextChunks,
          }));
        const answer = await runAnswerEval(
          item,
          retrieval,
          {
            chatModel: settings.chatModel,
            spoilerProtection: settings.spoilerProtection,
          },
        );
        next[item.source.id] = {
          caseId: item.source.id,
          retrieval,
          answer,
        };
        setResults({ ...next });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnswerLoading(false);
    }
  }, [
    matched,
    results,
    settings.chatModel,
    settings.maxContextChunks,
    settings.spoilerProtection,
  ]);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="border-b" style={{ borderColor: "var(--rule-soft)" }}>
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-8 py-4">
          <div
            className="flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            <Icon.sparkle size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              style={{
                fontFamily: "var(--heading-stack)",
                fontSize: 18,
                fontWeight: 500,
              }}
            >
              RAG evals
            </div>
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--inter-stack)",
                fontSize: 10,
                letterSpacing: 1.3,
                color: "var(--ink-muted)",
                marginTop: 2,
              }}
            >
              Offline checks for retrieval, spoiler safety, and page focus
            </div>
          </div>
          <Link to="/" className="outline-btn">
            Back to library
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-8 py-8">
        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Seed cases" value={String(GLOSSE_EVAL_SEED.length)} />
          <StatCard label="Matched books" value={String(matched.length)} />
          <StatCard label="Indexed books" value={String(books.length)} />
          <StatCard
            label="Answer checks"
            value={
              summary.answerDone === 0
                ? "not run"
                : `${summary.answerChecksOk}/${summary.answerDone}`
            }
          />
        </section>

        <section
          className="mt-6 rounded-[20px] border"
          style={{
            borderColor: "var(--rule-soft)",
            background: "rgba(255,255,255,0.72)",
          }}
        >
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <button
              type="button"
              className="outline-btn"
              onClick={() => void reloadBooks()}
            >
              Refresh indexed books
            </button>
            <button
              type="button"
              className="outline-btn"
              onClick={() => void runRetrievalSuite()}
              disabled={loading || matched.length === 0}
            >
              {loading ? "Running retrieval…" : "Run retrieval suite"}
            </button>
            <button
              type="button"
              className="outline-btn"
              onClick={() => void runAnswerSuite()}
              disabled={answerLoading || matched.length === 0}
            >
              {answerLoading ? "Running answers…" : "Run answer checks"}
            </button>
            <div
              style={{
                fontFamily: "var(--inter-stack)",
                fontSize: 12,
                color: "var(--ink-muted)",
                marginLeft: "auto",
              }}
            >
              Retrieval done: {summary.retrievalDone}/{matched.length} ·
              Spoiler safe: {summary.spoilerSafe}/{summary.retrievalDone || 1} ·
              Preferred top-1: {preferredTop1Value}
            </div>
          </div>

          {error && (
            <div
              className="mx-5 mb-5 rounded-[16px] border px-4 py-3"
              style={{
                borderColor: "rgba(143, 58, 31, 0.22)",
                background: "rgba(143, 58, 31, 0.06)",
                color: "#7c3e23",
                fontFamily: "var(--inter-stack)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </section>

        {unresolved.length > 0 && (
          <section className="mt-6">
            <SectionTitle>Unresolved seed cases</SectionTitle>
            <div className="mt-3 grid gap-3">
              {unresolved.map((item) => (
                <div
                  key={item.source.id}
                  className="rounded-[18px] border px-4 py-4"
                  style={{ borderColor: "var(--rule-soft)" }}
                >
                  <div
                    style={{
                      fontFamily: "var(--heading-stack)",
                      fontSize: 15,
                      fontWeight: 500,
                    }}
                  >
                    {item.source.id}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--inter-stack)",
                      fontSize: 12,
                      color: "var(--ink-muted)",
                      marginTop: 4,
                    }}
                  >
                    {item.reason}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <SectionTitle>Seed cases</SectionTitle>
          <div className="mt-3 grid gap-4">
            {resolved.map((item) => (
              <CaseCard
                key={item.source.id}
                resolved={item}
                result={results[item.source.id]}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--heading-stack)",
        fontSize: 22,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-[18px] border px-4 py-4"
      style={{ borderColor: "var(--rule-soft)" }}
    >
      <div
        className="uppercase"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          letterSpacing: 1.3,
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 24,
          fontWeight: 500,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CaseCard({
  resolved,
  result,
}: {
  resolved: ResolvedEvalCase;
  result?: EvalRunResult;
}) {
  const { source } = resolved;
  const retrieval = result?.retrieval;
  const answer = result?.answer;
  const preferredHitValue = getPreferredHitValue(
    retrieval?.preferredHitRank ?? null,
    source.preferredPages,
  );

  return (
    <article
      className="rounded-[22px] border px-5 py-5"
      style={{ borderColor: "var(--rule-soft)" }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: "var(--heading-stack)",
              fontSize: 18,
              fontWeight: 500,
            }}
          >
            {source.question}
          </div>
          <div
            className="uppercase"
            style={{
              fontFamily: "var(--inter-stack)",
              fontSize: 10,
              letterSpacing: 1.2,
              color: "var(--ink-muted)",
              marginTop: 6,
            }}
          >
            {source.bookTitle}
            {source.bookAuthor ? ` · ${source.bookAuthor}` : ""}
            {` · p. ${source.currentPage}`}
          </div>
        </div>
        <StatusPill
          label={
            resolved.resolution === "matched"
              ? "matched"
              : resolved.resolution
          }
          tone={resolved.resolution === "matched" ? "ok" : "warn"}
        />
      </div>

      <div
        className="mt-4 flex flex-wrap gap-2"
        style={{ fontFamily: "var(--inter-stack)", fontSize: 11 }}
      >
        {source.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full px-2.5 py-1"
            style={{
              background: "rgba(26,22,18,0.06)",
              color: "var(--ink-muted)",
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {source.notes && (
        <p
          className="mt-4"
          style={{
            fontFamily: "var(--serif-stack)",
            fontSize: 15,
            color: "var(--ink-soft)",
          }}
        >
          {source.notes}
        </p>
      )}

      {retrieval && (
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <MetricPill
            label="Top pages"
            value={retrieval.retrievedPages.slice(0, 5).join(", ") || "none"}
          />
          <MetricPill
            label="Spoiler safe"
            value={retrieval.spoilerSafe ? "yes" : "no"}
            ok={retrieval.spoilerSafe}
          />
          <MetricPill
            label="Preferred hit"
            value={preferredHitValue}
            ok={
              retrieval.preferredHitRank !== null
                ? retrieval.preferredHitRank <= 2
                : null
            }
          />
          <MetricPill
            label="Acceptable hit"
            value={retrieval.acceptableHitRank ? `@${retrieval.acceptableHitRank}` : "n/a"}
            ok={
              retrieval.acceptableHitRank !== null
                ? retrieval.acceptableHitRank <= 3
                : null
            }
          />
        </div>
      )}

      {answer && (
        <div
          className="mt-5 rounded-[16px] border px-4 py-4"
          style={{ borderColor: "var(--rule-soft)", background: "rgba(26,22,18,0.02)" }}
        >
          <div className="flex flex-wrap gap-3">
            <MetricPill
              label="Cited pages"
              value={answer.citedPages.join(", ") || "none"}
              ok={answer.citedPages.length > 0}
            />
            <MetricPill
              label="Citations safe"
              value={answer.citedSpoilerSafe ? "yes" : "no"}
              ok={answer.citedSpoilerSafe}
            />
            <MetricPill
              label="Required phrases"
              value={answer.requiredSubstringsOk ? "pass" : "fail"}
              ok={answer.requiredSubstringsOk}
            />
            <MetricPill
              label="Forbidden phrases"
              value={answer.forbiddenSubstringsOk ? "pass" : "fail"}
              ok={answer.forbiddenSubstringsOk}
            />
          </div>
          <div
            className="mt-4"
            style={{
              fontFamily: "var(--serif-stack)",
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--ink)",
            }}
          >
            {answer.text}
          </div>
        </div>
      )}
    </article>
  );
}

function getPreferredHitValue(
  preferredHitRank: number | null,
  preferredPages: number[] | undefined,
): string {
  if (preferredHitRank !== null) return `@${preferredHitRank}`;
  if (preferredPages && preferredPages.length > 0) return "miss";
  return "n/a";
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn";
}) {
  return (
    <span
      className="rounded-full px-3 py-1.5 uppercase"
      style={{
        fontFamily: "var(--inter-stack)",
        fontSize: 10,
        letterSpacing: 1.2,
        background:
          tone === "ok" ? "rgba(37, 99, 70, 0.08)" : "rgba(143, 58, 31, 0.08)",
        color: tone === "ok" ? "#256346" : "#8f3a1f",
      }}
    >
      {label}
    </span>
  );
}

function MetricPill({
  label,
  value,
  ok = null,
}: {
  label: string;
  value: string;
  ok?: boolean | null;
}) {
  const color =
    ok === null
      ? "var(--ink-muted)"
      : ok
        ? "#256346"
        : "#8f3a1f";

  return (
    <div
      className="rounded-[14px] border px-3 py-2"
      style={{ borderColor: "var(--rule-soft)", minWidth: 120 }}
    >
      <div
        className="uppercase"
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 10,
          letterSpacing: 1.1,
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 16,
          fontWeight: 500,
          color,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
