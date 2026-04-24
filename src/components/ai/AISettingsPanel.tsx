import { useState } from "react";

import { Icon } from "@/components/Icons";
import {
  listSupportedEmbeddingModels,
  listSupportedEmbeddingProviders,
} from "@/ai/embedding/compat";
import { ReaderProfileSection } from "@/components/ai/ReaderProfileSection";
import { PROVIDER_CATALOG } from "@/ai/providers/catalog";
import { useAISettings } from "@/ai/providers/settings";
import type { ProviderId } from "@/ai/types";
import { downloadExport } from "@/lib/export";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AISettingsPanel({ open, onClose }: Props) {
  const s = useAISettings();
  const [revealed, setRevealed] = useState<Partial<Record<ProviderId, boolean>>>({});
  const embeddingProviders = listSupportedEmbeddingProviders();
  const embeddingModels = listSupportedEmbeddingModels(s.embeddingModel.provider);

  const toggleReveal = (p: ProviderId) =>
    setRevealed((r) => ({ ...r, [p]: !r[p] }));

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.28)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease",
          zIndex: 30,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: open
            ? "translate(-50%, -50%)"
            : "translate(-50%, -50%) scale(0.98)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "transform 0.2s ease, opacity 0.2s ease",
          zIndex: 31,
          width: "min(560px, 92vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "var(--panel-bg)",
          border: "1px solid var(--rule-soft)",
          borderRadius: 16,
          boxShadow: "0 30px 80px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.08)",
        }}
      >
        <header
          className="flex items-center justify-between"
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--rule-soft)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--ink)",
                color: "var(--paper)",
              }}
            >
              <Icon.sparkle size={15} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--heading-stack)",
                  fontSize: 17,
                  fontWeight: 500,
                  color: "var(--ink)",
                }}
              >
                AI settings
              </div>
              <div
                className="uppercase"
                style={{
                  fontFamily: "var(--inter-stack)",
                  fontSize: 10,
                  letterSpacing: 1.4,
                  color: "var(--ink-muted)",
                  marginTop: 2,
                }}
              >
                Bring your own keys · stored locally
              </div>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon.close size={16} />
          </button>
        </header>

        <div style={{ padding: "18px 22px 22px" }}>
          <Row label="AI features">
            <Toggle
              checked={s.enabled}
              onChange={(v) => s.setEnabled(v)}
              label={s.enabled ? "Enabled" : "Disabled"}
            />
          </Row>

          <Divider />

          <SectionTitle>Chat model</SectionTitle>
          <Row label="Provider">
            <select
              value={s.chatModel.provider}
              onChange={(e) => {
                const provider = e.target.value as ProviderId;
                s.setChatModel({
                  provider,
                  model: PROVIDER_CATALOG[provider].defaultChatModel,
                });
              }}
              className="dropdown"
            >
              {(Object.keys(PROVIDER_CATALOG) as ProviderId[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_CATALOG[p].label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Model">
            <select
              value={s.chatModel.model}
              onChange={(e) =>
                s.setChatModel({ ...s.chatModel, model: e.target.value })
              }
              className="dropdown"
            >
              {PROVIDER_CATALOG[s.chatModel.provider].chatModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Row>

          <Divider />

          <SectionTitle>Embeddings</SectionTitle>
          <Row label="">
            <div
              className="italic"
              style={{
                fontFamily: "var(--serif-stack)",
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--ink-muted)",
              }}
            >
              Default for new indexes. Books already indexed keep their
              own model — re-index a book from its Ask tab to switch.
            </div>
          </Row>
          <Row label="Provider">
            <select
              value={s.embeddingModel.provider}
              onChange={(e) => {
                const provider = e.target.value as "openai" | "ollama";
                const model = listSupportedEmbeddingModels(provider)[0];
                if (!model) return;
                s.setEmbeddingModel({ provider, model: model.id, dimensions: model.dims });
              }}
              className="dropdown"
            >
              {embeddingProviders.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_CATALOG[p].label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Model">
            <select
              value={s.embeddingModel.model}
              onChange={(e) => {
                const match = embeddingModels.find((m) => m.id === e.target.value);
                if (!match) return;
                s.setEmbeddingModel({
                  provider: s.embeddingModel.provider,
                  model: match.id,
                  dimensions: match.dims,
                });
              }}
              className="dropdown"
            >
              {embeddingModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.dims}d
                </option>
              ))}
            </select>
          </Row>
          {embeddingProviders.length === 0 && (
            <Row label="Status">
              <span
                style={{
                  fontFamily: "var(--inter-stack)",
                  fontSize: 12,
                  color: "var(--ink-muted)",
                }}
              >
                No compatible local embedding model is configured for this build.
              </span>
            </Row>
          )}

          <Divider />

          <SectionTitle>API keys</SectionTitle>
          {(Object.keys(PROVIDER_CATALOG) as ProviderId[])
            .filter((p) => PROVIDER_CATALOG[p].needsApiKey)
            .map((p) => (
              <Row key={p} label={PROVIDER_CATALOG[p].label}>
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type={revealed[p] ? "text" : "password"}
                    value={s.apiKeys[p]}
                    onChange={(e) => s.setApiKey(p, e.target.value)}
                    placeholder="sk-…"
                    className="input"
                    style={{ flex: 1 }}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => toggleReveal(p)}
                    title={revealed[p] ? "Hide" : "Show"}
                  >
                    <Icon.settings size={14} />
                  </button>
                </div>
              </Row>
            ))}
          <Row label="Ollama URL">
            <input
              type="text"
              value={s.ollamaBaseUrl}
              onChange={(e) => s.setOllamaBaseUrl(e.target.value)}
              className="input"
              style={{ flex: 1 }}
              spellCheck={false}
            />
          </Row>

          <Divider />

          <SectionTitle>Retrieval</SectionTitle>
          <Row label="Spoiler protection">
            <Toggle
              checked={s.spoilerProtection}
              onChange={(v) => s.setSpoilerProtection(v)}
              label={s.spoilerProtection ? "On" : "Off"}
            />
          </Row>
          <Row label="Passages per query">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="icon-btn"
                style={{ width: 26, height: 26 }}
                onClick={() =>
                  s.setMaxContextChunks(Math.max(2, s.maxContextChunks - 1))
                }
              >
                –
              </button>
              <span
                style={{
                  fontFamily: "var(--mono-stack)",
                  fontSize: 12,
                  minWidth: 20,
                  textAlign: "center",
                  color: "var(--ink)",
                }}
              >
                {s.maxContextChunks}
              </span>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 26, height: 26 }}
                onClick={() =>
                  s.setMaxContextChunks(Math.min(20, s.maxContextChunks + 1))
                }
              >
                +
              </button>
            </div>
          </Row>
          <Row label="Contextual retrieval">
            <Toggle
              checked={s.useContextualRetrieval}
              onChange={(v) => s.setUseContextualRetrieval(v)}
              label={
                s.useContextualRetrieval
                  ? "On (better quality, slower index)"
                  : "Off (faster index)"
              }
            />
          </Row>

          <Divider />

          <SectionTitle>Reader profile</SectionTitle>
          <ReaderProfileSection />

          <Divider />

          <SectionTitle>Data</SectionTitle>
          <Row label="Export">
            <button
              type="button"
              className="outline-btn"
              onClick={() => void downloadExport()}
            >
              Download all data (.json)
            </button>
          </Row>

          <div
            className="italic"
            style={{
              marginTop: 18,
              fontFamily: "var(--serif-stack)",
              fontSize: 12,
              color: "var(--ink-muted)",
              lineHeight: 1.5,
            }}
          >
            Keys stay on this device. Requests go straight from your browser
            to the provider — no glosse server in between.
          </div>
        </div>
      </div>

      <style>{`
        .dropdown {
          min-width: 180px;
          padding: 6px 10px;
          border: 1px solid var(--rule);
          border-radius: 8px;
          background: var(--paper);
          color: var(--ink);
          font-family: var(--inter-stack);
          font-size: 12.5px;
        }
        .input {
          padding: 6px 10px;
          border: 1px solid var(--rule);
          border-radius: 8px;
          background: var(--paper);
          color: var(--ink);
          font-family: var(--mono-stack);
          font-size: 12px;
          outline: none;
        }
        .input:focus, .dropdown:focus {
          border-color: var(--accent);
        }
      `}</style>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: "6px 0", gap: 16 }}
    >
      <div
        style={{
          fontFamily: "var(--inter-stack)",
          fontSize: 13,
          color: "var(--ink-soft)",
          minWidth: 130,
        }}
      >
        {label}
      </div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        fontFamily: "var(--inter-stack)",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 1.4,
        color: "var(--ink-muted)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--rule-soft)",
        margin: "14px 0 14px",
      }}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        style={{
          width: 34,
          height: 20,
          borderRadius: 999,
          background: checked ? "var(--accent)" : "var(--rule)",
          position: "relative",
          transition: "background 0.15s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: "#fff",
            transition: "left 0.15s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </span>
      {label && (
        <span
          style={{
            fontFamily: "var(--inter-stack)",
            fontSize: 12,
            color: "var(--ink-soft)",
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}
