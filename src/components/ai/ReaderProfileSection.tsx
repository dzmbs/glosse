import { useEffect, useState } from "react";

import {
  getProfile,
  updateProfile,
  type ProfilePatch,
  type ReaderProfile,
} from "@/ai/profile";

const TONES = ["warm", "concise", "playful", "formal"] as const;
const ANSWER_STYLES = ["concise", "balanced", "detailed"] as const;
const QUIZ_STYLES = ["socratic", "multiple_choice", "short_answer"] as const;

type ChipListProps = {
  label: string;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
};

function ChipList({ label, values, onAdd, onRemove, placeholder }: ChipListProps) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    onAdd(v);
    setDraft("");
  };

  return (
    <div style={{ flex: 1 }}>
      <div
        className="flex flex-wrap gap-[5px]"
        style={{ marginBottom: values.length > 0 ? 6 : 0 }}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1"
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(184,74,43,0.10)",
              color: "var(--accent)",
              fontFamily: "var(--inter-stack)",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {v}
            <button
              type="button"
              onClick={() => onRemove(v)}
              aria-label={`Remove ${v}`}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                padding: 0,
                lineHeight: 1,
                fontSize: 14,
                opacity: 0.7,
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="input"
        style={{ width: "100%" }}
        aria-label={label}
      />
    </div>
  );
}

export function ReaderProfileSection() {
  const [profile, setProfile] = useState<ReaderProfile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const p = await getProfile();
        setProfile(p);
      } catch {
        // getProfile throws if the db isn't ready yet; the user will
        // open this panel again after AI is enabled. Leave the form
        // empty until then.
      }
    })();
  }, []);

  const patch = async (p: ProfilePatch) => {
    setSaving(true);
    try {
      const next = await updateProfile(p);
      setProfile(next);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div
        className="italic"
        style={{
          fontFamily: "var(--serif-stack)",
          fontSize: 12.5,
          color: "var(--ink-muted)",
        }}
      >
        Enable AI above to edit your reader profile. It's stored locally and
        added to every chat as soft preferences — tone, style, interests.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Row label="Tone">
        <SegmentedSelect
          options={TONES}
          value={profile.tone}
          onChange={(v) => void patch({ tone: v })}
        />
      </Row>
      <Row label="Answers">
        <SegmentedSelect
          options={ANSWER_STYLES}
          value={profile.answerStyle}
          onChange={(v) => void patch({ answerStyle: v })}
        />
      </Row>
      <Row label="Quizzes">
        <SegmentedSelect
          options={QUIZ_STYLES}
          value={profile.preferredQuizStyle}
          onChange={(v) => void patch({ preferredQuizStyle: v })}
        />
      </Row>
      <Row label="Interests" stretch>
        <ChipList
          label="interests"
          values={profile.interests}
          onAdd={(v) =>
            void patch({ interests: [...profile.interests, v] })
          }
          onRemove={(v) =>
            void patch({ interests: profile.interests.filter((x) => x !== v) })
          }
          placeholder="add interest and press Enter"
        />
      </Row>
      <Row label="Weak spots" stretch>
        <ChipList
          label="weak concepts"
          values={profile.weakConcepts}
          onAdd={(v) =>
            void patch({ weakConcepts: [...profile.weakConcepts, v] })
          }
          onRemove={(v) =>
            void patch({
              weakConcepts: profile.weakConcepts.filter((x) => x !== v),
            })
          }
          placeholder="concepts you want revisited"
        />
      </Row>
      {saving && (
        <div
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 11,
            color: "var(--ink-muted)",
          }}
        >
          Saving…
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  children,
  stretch,
}: {
  label: string;
  children: React.ReactNode;
  stretch?: boolean;
}) {
  return (
    <div
      className={stretch ? "flex items-start" : "flex items-center"}
      style={{ gap: 16 }}
    >
      <div
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 13,
          color: "var(--ink-soft)",
          minWidth: 110,
          paddingTop: stretch ? 6 : 0,
        }}
      >
        {label}
      </div>
      <div className={stretch ? "flex-1" : "flex items-center"}>{children}</div>
    </div>
  );
}

function SegmentedSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="flex rounded-[10px] p-[3px]"
      style={{ border: "1px solid var(--rule-soft)" }}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              padding: "5px 10px",
              borderRadius: 7,
              background: active ? "var(--ink)" : "transparent",
              color: active ? "var(--paper)" : "var(--ink-muted)",
              border: "none",
              fontFamily: "var(--inter-stack)",
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {opt.replace(/_/g, " ")}
          </button>
        );
      })}
    </div>
  );
}
