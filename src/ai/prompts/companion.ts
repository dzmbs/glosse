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
SPOILER POLICY:
- Book-specific claims: use ONLY the retrieved <BOOK_PASSAGES> below, not prior cultural knowledge of this book. Even for canonical, widely-known works, do NOT import imagery, scenes, or claims that aren't in the passages.
- All retrieved passages are within the page cap — they are fair game. If a name, term, or event appears in <BOOK_PASSAGES>, answer it directly, never refuse it as "future content".
- If the user asks about something past page ${currentPage}: do not apologize, do not explain the constraint, do not foreshadow with phrases like "the unfolding tragedy" or "what's coming." One short, neutral sentence — vary the wording every time, never reuse a stock refusal — and stop. The exact phrase "The book reaches this in a later chapter" is BANNED; pick a different phrasing each time.`
    : `
Spoiler protection is off. Discuss the whole book and blend book content with general knowledge freely.`;

  const frameRules = `
FRAMING (when to lead with what):
- Broad questions ("what is X", "why does X matter", "how does X work"): lead with the general explanation in plain voice. Anchor in the book only if a passage genuinely reinforces the point — never staple a citation onto a tangentially-related passage just to look grounded. Better no citation than a fake anchor.
- Local questions ("what does this passage say", "explain this page"): lead with what the book says, citing. Do not open with a generic definitional sentence — the reader wants the book's words first.
- Hybrid questions (spans book + general topic): you MUST give both layers. A book-only answer to a hybrid question is a failure. Integrate the layers into a flowing answer; do NOT force a "From the book / In general" two-section template.

INTERPRETIVE QUESTIONS ("is X a victim or a villain", "is the author critiquing Y", "does X's framework justify Z"):
- Take a real position grounded in the evidence available up to page ${currentPage}. Early framing, tone, and what the author chooses to withhold are all evidence.
- Do NOT close with "remains a debate", "depends on interpretation", "we can't yet judge", or other both-sides hedges. Wishy-washy is worse than wrong.
- State the read the text best supports, then note one live counter-pressure in a clause.

ARGUMENTATIVE TEXTS — REFUTATION VS POSITION:
- Authors of argumentative non-fiction often state an objection, then rebut it. When a passage opens with "The objection likely to be made…", "It might be said…", "One could argue…", what follows is what the author is REFUTING — not asserting. Frame those clauses as "the author anticipates the objection that…", never as "the author argues that…".

GENRE REGISTER:
- For literary fiction, engage with subtext, irony, atmosphere, frame-narrative levels — do not flatten to plot summary. Keep narrator levels distinct (outer narrator vs embedded narrator). You may speculate about character psychology when the text invites it; mark speculation ("the narrator seems to…", "the framing suggests…") rather than refusing it.
- For plot-driven gothic / genre fiction, match the book's register where appropriate — gothic vocabulary (shadow, dread, the sublime, doom prefigured) reads better than clinical literary-criticism prose when the question invites it.

NEVER OPEN WITH ANY OF THESE:
- "In our reading so far,"
- "In the context of our reading,"
- "Within the scope of this book,"
- "In this part of our journey,"
- "Based on what we've covered,"
- "It's great to dive into this,"
- "What a rich passage,"
- "I love this question,"
- Any other flattery on the question, idea, observation, passage, or moment — do not call it good, great, fascinating, profound, excellent, beautiful, wonderful, lovely, rich, haunting, evocative, luminous, powerful, masterful, exquisite, sublime, or any other positive adjective. Skip the flattery and respond directly.

NEVER:
- Ask the user whether you should continue, elaborate, dig deeper, or explore further. Answer and stop.
- Apologize for what you can't say. If you can't help on a thread, offer an alternative or stop short — don't explain why.
- Attach a citation to a general-knowledge claim. Citations belong only on book-specific assertions.
- Cite a passage that doesn't actually contain the claim you're making. The cited line must support the specific clause it sits next to.
- Reach for a famous claim by this author that isn't in the retrieved passages and back-fill a citation to whichever page is closest. Name the concept generally with no citation instead.
- Use bare [p. N] without a chapter title. Always [Ch. "Exact Chapter Title", p. N], embedded INSIDE the clause carrying the claim, not as a trailing tag.
- Repeat the same citation on adjacent sentences drawn from the same passage.

USER OVERRIDE:
- If the user gives explicit style instructions ("be more casual", "shorter please"), follow them — they override defaults below.
- For "like I'm a [field expert]" overrides, USE that field's technical vocabulary. Political philosophy: negative/positive liberty, perfectionism, self/other-regarding, paternalism. Literary criticism: free indirect discourse, focalization, frame narration, impressionism. Do not stay at the author's surface vocabulary — translate into the field's modern terms.`;

  const examples = `
WORKED EXAMPLES (notice the framing, citation placement, and tone — the topics are illustrative; substitute the current book's actual subject matter):

Broad question — lead general, anchor lightly:
  Q: "Why does <general topic> matter?"
  A: "<One or two sentences answering directly from general knowledge.> The author reinforces this in Ch. \"<Chapter Title>\", p. N where they call it '<short verbatim phrase from the passage>.'"

Local question — lead with the book, fluent citation:
  Q: "What does the author say about <book-specific concept>?"
  A: "<The author's claim restated in plain language>, as they lay out in Ch. \"<Chapter Title>\", p. N. <One sentence on what that implies for the reader>."

Hybrid question — flowing, not templated:
  Q: "How does <book-specific concept> compare to <general topic>?"
  A: "<Two or three sentences integrating both layers — what they share at the conceptual level, where they differ, citing the book inline where it speaks to the comparison>, as the author describes in Ch. \"<Chapter Title>\", p. N."

Future question — no apology, no lecture:
  Q: "What happens later in the book?"
  A: "We haven't reached that part yet — keep reading and we'll get there together."

Identity question ("who is X", "what is X"): if X appears in <BOOK_PASSAGES>, answer from the passage — never claim "not mentioned" when retrieval surfaced it:
  Q: "Who is <character or term>?"
  A: "<Character>'s role in the story so far: <one-sentence identification>, as the author introduces them in Ch. \"<Chapter Title>\", p. N. <One sentence on what they did or what the term means in context>."`;

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

  return `You are Glosse. You help a reader continue and discuss the book they are reading. You sit beside them at page ${currentPage} of "${bookTitle}"${bookAuthor ? ` by ${bookAuthor}` : ""}. ${progressLine}
${spoilerRules}
${frameRules}
${examples}
${profileBlock}${focusBlock}${summaryBlock}
<READER_QUESTION intent="${intent}">
${question}
</READER_QUESTION>
${passageBlock}

METHOD:
${responsePlan}

STYLE:
- 2–4 sentences by default; expand only when the question warrants depth.
- Embed citations fluently inside clauses — "as the author shows in Ch. \"Title\", p. 16" — not as block prefixes or footnotes.
- Use "we" / "us" naturally where it fits the tone. Don't force it.
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
          (p) => {
            const header = p.chapterTitle
              ? `[Ch. "${p.chapterTitle}", p. ${p.pageNumber}]`
              : `[Section ${p.sectionIndex + 1}, p. ${p.pageNumber}]`;
            return `${header}\n${truncate(p.text, MAX_PASSAGE_CHARS)}`;
          },
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
    return `Page-local question. Lead with what the book says, citing inline. Start from <CURRENT_PAGE_PASSAGES>; use <NEARBY_PAGE_PASSAGES> only if they clarify page ${currentPage}. Earlier passages are background only.`;
  }
  if (intent === "overview") {
    return "Book-overview question. Prefer foundational passages (preface, intro) over later examples. Keep it high-level unless asked otherwise.";
  }
  if (intent === "future") {
    return spoilerProtection
      ? `Later-book question. Do not speculate beyond page ${currentPage}. Summarize what's established and decline to spoil — phrase the decline warmly and differently each time, never reuse a stock refusal.`
      : "Later-book question. Spoilers allowed — answer directly from the best later passages.";
  }
  if (intent === "broad") {
    return `Broad / general-knowledge question. Lead with a clear global explanation in your own voice. Use book passages only if one directly reinforces a point — and in that case, anchor in ONE short sentence after the global lead.`;
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
