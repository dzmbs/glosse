import type { ReadingFocus, RetrievedChunk } from "../types";
import { truncate } from "../utils/str";

const MAX_PASSAGE_CHARS = 520;

export type ReaderIntent = "local" | "overview" | "future" | "broad";

export type ReaderProfileSnippet = {
  tone?: string;
  answerStyle?: string;
  preferredQuizStyle?: string;
  weakConcepts?: string[];
  interests?: string[];
};

export type CompanionPromptInput = {
  bookTitle: string;
  bookAuthor: string;
  question: string;
  currentPage: number;
  totalPages?: number;
  passages: RetrievedChunk[];
  /** If true, the assistant must not reference anything beyond `currentPage`. */
  spoilerProtection: boolean;
  profile?: ReaderProfileSnippet;
  focus?: ReadingFocus;
  /** Compact structured summary of prior turns, if one exists. */
  conversationSummary?: string;
};

export function buildCompanionPrompt(input: CompanionPromptInput): string {
  const {
    bookTitle,
    bookAuthor,
    question,
    currentPage,
    totalPages,
    passages,
    spoilerProtection,
    profile,
    focus,
    conversationSummary,
  } = input;
  const intent = classifyReaderIntent(question, focus);

  const progressLine = totalPages
    ? `You are currently on page ${currentPage} of ${totalPages}.`
    : `You are currently on page ${currentPage}.`;

  const spoilerRules = spoilerProtection
    ? `
RULES (non-negotiable):
- Book-specific claims (plot, characters, author's arguments): use ONLY the provided passages, not prior knowledge of this book.
- Never discuss anything past page ${currentPage}. If asked, briefly summarize what's established and decline to spoil.
- General-knowledge questions ("what is X in general"): answer from broader knowledge, prefix with "In general," or "Outside the book,".
- Hybrid questions: book first (with citations), then a short "In general:" section.`
    : `
Spoiler protection is off. Discuss the whole book and blend book content with general knowledge freely.`;

  const profileBlock = profile
    ? formatProfile(profile)
    : "";
  const focusBlock = formatFocus(focus);

  const summaryBlock = conversationSummary
    ? `\n\n<CONVERSATION_SO_FAR>\n${conversationSummary}\n</CONVERSATION_SO_FAR>`
    : "";

  const passageBlock = formatPassages(
    passages,
    currentPage,
    spoilerProtection,
    intent,
  );
  const responsePlan = buildResponsePlan(intent, currentPage, spoilerProtection);

  return `You are Glosse, a warm reading companion on page ${currentPage} of "${bookTitle}"${bookAuthor ? ` by ${bookAuthor}` : ""}. ${progressLine}
${spoilerRules}
${profileBlock}${focusBlock}${summaryBlock}
<READER_QUESTION intent="${intent}">
${question}
</READER_QUESTION>
${passageBlock}

METHOD:
${responsePlan}

STYLE:
- Cite book-specific claims inline like [Ch. "Title", p. 42]. Prefer the closest relevant page.
- General-knowledge claims need no citations — just be accurate.
- 2–4 sentences by default; use "we" — we're reading together.
- If <CURRENT_READING_FOCUS> is present, it's the primary anchor.`;
}

function formatPassages(
  passages: RetrievedChunk[],
  currentPage: number,
  spoilerProtection: boolean,
  intent: ReaderIntent,
): string {
  if (passages.length === 0) {
    return `

<BOOK_PASSAGES>
(No indexed passages retrieved for this question. Tell the reader the book may not be fully indexed yet, or the question may be beyond the current page.)
</BOOK_PASSAGES>`;
  }

  const bounded = spoilerProtection
    ? passages.filter((p) => p.pageNumber <= currentPage)
    : passages;

  const current = bounded.filter((p) => p.pageNumber === currentPage);
  const nearby = bounded.filter(
    (p) => p.pageNumber !== currentPage && Math.abs(p.pageNumber - currentPage) <= 2,
  );
  const earlier = bounded.filter((p) => p.pageNumber < currentPage - 2);
  const later = bounded.filter((p) => p.pageNumber > currentPage + 2);
  const grouped = orderGroups(intent, current, nearby, earlier, later);

  const attrs = spoilerProtection
    ? ` page_limit="${currentPage}"`
    : "";

  return `

<BOOK_PASSAGES${attrs}>
${grouped}
</BOOK_PASSAGES>`;
}

function orderGroups(
  intent: ReaderIntent,
  current: RetrievedChunk[],
  nearby: RetrievedChunk[],
  earlier: RetrievedChunk[],
  later: RetrievedChunk[],
): string {
  const sections: string[] = [];

  const push = (label: string, rows: RetrievedChunk[]) => {
    if (rows.length === 0) return;
    sections.push(`<${label}>`);
    sections.push(
      rows
        .map(
          (p) =>
            `[${p.chapterTitle || `Section ${p.sectionIndex + 1}`}, p. ${p.pageNumber}]\n${truncate(p.text, MAX_PASSAGE_CHARS)}`,
        )
        .join("\n\n---\n\n"),
    );
    sections.push(`</${label}>`);
  };

  if (intent === "overview") {
    const foundational = [...earlier, ...current, ...nearby, ...later]
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .slice(0, 6);
    const remainder = [...current, ...nearby, ...earlier, ...later].filter(
      (passage) => !foundational.some((picked) => picked.chunkId === passage.chunkId),
    );

    push("FOUNDATIONAL_PASSAGES", foundational);
    push("SUPPORTING_PASSAGES", remainder);
  } else {
    push("CURRENT_PAGE_PASSAGES", current);
    push("NEARBY_PAGE_PASSAGES", nearby);
    push("EARLIER_SUPPORTING_PASSAGES", earlier);
    push("LATER_SUPPORTING_PASSAGES", later);
  }

  return sections.join("\n");
}

function buildResponsePlan(
  intent: ReaderIntent,
  currentPage: number,
  spoilerProtection: boolean,
): string {
  if (intent === "local") {
    return `Page-local question. Start from <CURRENT_PAGE_PASSAGES>; use <NEARBY_PAGE_PASSAGES> only if they clarify page ${currentPage}. Earlier passages are background only.`;
  }
  if (intent === "overview") {
    return "Book-overview question. Prefer foundational passages (preface, intro) over later examples. Keep it high-level unless asked otherwise.";
  }
  if (intent === "future") {
    return spoilerProtection
      ? `Later-book question. Do not speculate beyond page ${currentPage}. Summarize what's established and decline to spoil.`
      : "Later-book question. Spoilers allowed — answer directly from the best later passages.";
  }
  return "Use the closest relevant passages first; earlier passages as backup.";
}

export function classifyReaderIntent(
  question: string,
  focus?: ReadingFocus,
): ReaderIntent {
  if (focus?.selectedText) return "local";

  const normalized = question.trim().toLowerCase();
  if (!normalized) return "broad";

  if (
    /\b(this page|page i'm reading|page i am reading|page we'?re reading|page we are reading|this passage|this paragraph|this section|explain this page|what does this mean)\b/.test(
      normalized,
    )
  ) {
    return "local";
  }

  if (
    /\b(what is this book about|what's this book about|overview of this book|summarize this book|book about)\b/.test(
      normalized,
    )
  ) {
    return "overview";
  }

  if (
    /\b(later in the book|what happens later|what comes later|do we learn later|later chapters|ending)\b/.test(
      normalized,
    )
  ) {
    return "future";
  }

  return "broad";
}

function formatProfile(profile: ReaderProfileSnippet): string {
  const parts: string[] = [];
  if (profile.tone) parts.push(`Tone: ${profile.tone}`);
  if (profile.answerStyle) parts.push(`Answer style: ${profile.answerStyle}`);
  if (profile.preferredQuizStyle)
    parts.push(`Preferred quiz style: ${profile.preferredQuizStyle}`);
  if (profile.weakConcepts && profile.weakConcepts.length > 0) {
    parts.push(`Weak concepts to revisit: ${profile.weakConcepts.join(", ")}`);
  }
  if (profile.interests && profile.interests.length > 0) {
    parts.push(`Interests: ${profile.interests.join(", ")}`);
  }
  if (parts.length === 0) return "";
  return `\n\n<READER_PROFILE>\n${parts.join("\n")}\n</READER_PROFILE>`;
}

function formatFocus(focus?: ReadingFocus): string {
  if (!focus) return "";

  const parts: string[] = [];
  if (focus.pageNumber != null) parts.push(`Page: ${focus.pageNumber}`);
  if (focus.chapterTitle) parts.push(`Chapter: ${focus.chapterTitle}`);
  if (focus.selectedText) {
    parts.push(`Selected passage:\n${focus.selectedText}`);
  }

  if (parts.length === 0) return "";
  return `\n\n<CURRENT_READING_FOCUS>\n${parts.join("\n")}\n</CURRENT_READING_FOCUS>`;
}
