import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- vendored library, no types
import { makeBook } from "../../vendor/foliate-js/view.js";

import { extractSectionText } from "@/ai/indexing/extract";

type SectionResult = {
  index: number;
  linear: string | undefined;
  hasCreateDocument: boolean;
  createDocumentMs?: number;
  createDocumentError?: string;
  bodyPresent?: boolean;
  textLength?: number;
  textPreview?: string;
};

type Report = {
  fileName: string;
  fileSize: number;
  bookOpenMs: number;
  totalSections: number;
  walkMs: number;
  sectionsOk: number;
  sectionsEmpty: number;
  sectionsFailed: number;
  totalChars: number;
  errorSamples: Array<{ index: number; error: string }>;
  slowestSections: Array<{ index: number; ms: number }>;
  perSection: SectionResult[];
};

type FoliateSection = {
  id?: string | number;
  linear?: string;
  createDocument?: () => Promise<Document>;
};

export function DiagPdfPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(file: File) {
    setRunning(true);
    setReport(null);
    setError(null);
    setProgress("Opening book…");

    const totalStart = performance.now();
    try {
      const openStart = performance.now();
      const book = (await makeBook(file)) as { sections?: FoliateSection[] };
      const bookOpenMs = Math.round(performance.now() - openStart);
      const sections = book.sections ?? [];
      setProgress(`Walking ${sections.length} sections…`);

      const perSection: SectionResult[] = [];
      const errorSamples: Array<{ index: number; error: string }> = [];
      let okCount = 0;
      let emptyCount = 0;
      let failCount = 0;
      let totalChars = 0;

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i]!;
        const result: SectionResult = {
          index: i,
          linear: section.linear,
          hasCreateDocument: typeof section.createDocument === "function",
        };

        if (i % 10 === 0) {
          setProgress(`Section ${i + 1}/${sections.length}…`);
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!result.hasCreateDocument) {
          perSection.push(result);
          continue;
        }

        const docStart = performance.now();
        try {
          const doc = await section.createDocument!();
          result.createDocumentMs = Math.round(performance.now() - docStart);
          result.bodyPresent = !!doc.body;

          const text = extractSectionText(doc);
          result.textLength = text.length;
          result.textPreview = text.slice(0, 80);

          if (text.length > 0) {
            okCount++;
            totalChars += text.length;
          } else {
            emptyCount++;
          }
        } catch (err) {
          failCount++;
          result.createDocumentError =
            err instanceof Error ? err.message : String(err);
          if (errorSamples.length < 10) {
            errorSamples.push({ index: i, error: result.createDocumentError });
          }
        }

        perSection.push(result);
      }

      const walkMs = Math.round(performance.now() - totalStart);
      const slowest = perSection
        .filter((r) => r.createDocumentMs !== undefined)
        .sort(
          (a, b) => (b.createDocumentMs ?? 0) - (a.createDocumentMs ?? 0),
        )
        .slice(0, 5)
        .map((r) => ({ index: r.index, ms: r.createDocumentMs! }));

      setReport({
        fileName: file.name,
        fileSize: file.size,
        bookOpenMs,
        totalSections: sections.length,
        walkMs,
        sectionsOk: okCount,
        sectionsEmpty: emptyCount,
        sectionsFailed: failCount,
        totalChars,
        errorSamples,
        slowestSections: slowest,
        perSection,
      });
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress("");
    } finally {
      setRunning(false);
    }
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pdf-diag-${report.fileName.replace(/\.[^.]+$/, "")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: 880,
        margin: "0 auto",
        fontFamily: "var(--inter-stack)",
        fontSize: 14,
        lineHeight: 1.55,
        color: "var(--ink)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--heading-stack)",
          fontSize: 22,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        PDF extraction diagnostics
      </h1>
      <p
        style={{
          fontFamily: "var(--serif-stack)",
          color: "var(--ink-muted)",
          marginBottom: 18,
        }}
      >
        Pick any supported book file. Runs the same per-section extraction
        the indexer uses and reports what each section produced. Useful for
        finding which stage drops a PDF to zero text.
      </p>

      <input
        type="file"
        accept=".pdf,.epub,.mobi,.azw3,.fb2,.cbz"
        disabled={running}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void run(f);
          e.target.value = "";
        }}
      />

      {progress && (
        <div
          style={{
            marginTop: 14,
            fontFamily: "var(--mono-stack)",
            fontSize: 12,
            color: "var(--ink-muted)",
          }}
        >
          {progress}
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(201,74,59,0.08)",
            border: "1px solid #c94a3b",
            fontFamily: "var(--mono-stack)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {report && (
        <div style={{ marginTop: 24 }}>
          <Section title="Summary">
            <Stat label="File" value={`${report.fileName} (${(report.fileSize / 1024 / 1024).toFixed(1)} MB)`} />
            <Stat label="Book open time" value={`${report.bookOpenMs} ms`} />
            <Stat label="Sections" value={report.totalSections.toString()} />
            <Stat
              label="Total walk"
              value={`${(report.walkMs / 1000).toFixed(2)}s (${Math.round(report.walkMs / Math.max(1, report.totalSections))} ms/section avg)`}
            />
            <Stat label="OK (text extracted)" value={report.sectionsOk.toString()} />
            <Stat label="Empty (no text)" value={report.sectionsEmpty.toString()} />
            <Stat label="Failed (threw)" value={report.sectionsFailed.toString()} />
            <Stat label="Total chars" value={report.totalChars.toLocaleString()} />
          </Section>

          {report.errorSamples.length > 0 && (
            <Section title={`First ${report.errorSamples.length} errors`}>
              <pre
                style={{
                  fontFamily: "var(--mono-stack)",
                  fontSize: 11.5,
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
              >
                {report.errorSamples
                  .map((e) => `section ${e.index}: ${e.error}`)
                  .join("\n")}
              </pre>
            </Section>
          )}

          {report.slowestSections.length > 0 && (
            <Section title="Slowest sections">
              <pre
                style={{
                  fontFamily: "var(--mono-stack)",
                  fontSize: 11.5,
                  margin: 0,
                }}
              >
                {report.slowestSections
                  .map((s) => `section ${s.index}: ${s.ms} ms`)
                  .join("\n")}
              </pre>
            </Section>
          )}

          <Section title="Per-section detail (first 50)">
            <pre
              style={{
                fontFamily: "var(--mono-stack)",
                fontSize: 10.5,
                maxHeight: 400,
                overflow: "auto",
                margin: 0,
                whiteSpace: "pre",
              }}
            >
              {report.perSection
                .slice(0, 50)
                .map(
                  (r) =>
                    `[${String(r.index).padStart(4)}] linear=${r.linear ?? "-"} hasDoc=${r.hasCreateDocument} bodyPresent=${r.bodyPresent ?? "-"} chars=${r.textLength ?? "-"} ms=${r.createDocumentMs ?? "-"}${r.createDocumentError ? ` ERR: ${r.createDocumentError}` : ""}`,
                )
                .join("\n")}
            </pre>
          </Section>

          <button
            type="button"
            onClick={downloadReport}
            style={{
              marginTop: 16,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--rule)",
              background: "var(--paper)",
              cursor: "pointer",
              fontFamily: "var(--inter-stack)",
              fontSize: 13,
            }}
          >
            Download report JSON
          </button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 18 }}>
      <h2
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--ink-muted)",
          marginBottom: 8,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "4px 0",
        borderBottom: "1px dotted var(--rule-soft)",
      }}
    >
      <span style={{ flex: "0 0 180px", color: "var(--ink-muted)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--mono-stack)",
          fontSize: 12.5,
        }}
      >
        {value}
      </span>
    </div>
  );
}
