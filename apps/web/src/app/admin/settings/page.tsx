"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircle,
  ScanFace,
  Sparkles,
} from "lucide-react";
import {
  adminApi,
  type AdminSettings,
  type ImageProvider,
  type ProviderKeyStatus,
} from "@/lib/admin";

/** One write-only API-key card. The value is never returned by the API, so the
 *  input is always blank and we show only a masked status. */
function ApiKeyCard({
  title,
  blurb,
  placeholder,
  status,
  onSave,
}: {
  title: string;
  blurb: React.ReactNode;
  placeholder: string;
  status: ProviderKeyStatus;
  onSave: (key: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await onSave(input.trim());
      setMsg(input.trim() ? "Key saved securely ✓" : "Key cleared");
      setInput("");
      setShow(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mb-6 p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-lilac text-brand-primary">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h2 className="font-bold text-slate-deep">{title}</h2>
          <p className="mt-1 text-sm text-slate-mutedText">{blurb}</p>

          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="font-semibold text-slate-deep">Status:</span>
            {status.set ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                <Check className="h-3.5 w-3.5" /> Set ••••{status.last4}
                <span className="font-medium text-emerald-600/80">
                  ({status.source === "admin" ? "admin-set" : "from environment"})
                </span>
              </span>
            ) : (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
                Not set
              </span>
            )}
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-semibold text-slate-deep">
              {status.set ? "Replace key" : "Set key"}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={show ? "text" : "password"}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-xl border-2 border-brand-borderAccent bg-white px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-brand-primary"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-deep"
                  aria-label={show ? "Hide" : "Show"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                onClick={save}
                disabled={saving || !input.trim()}
                className="btn-primary shrink-0 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save key"}
              </button>
            </div>
            {msg && (
              <p className="mt-2 text-xs font-semibold text-slate-mutedText">{msg}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PROVIDERS: {
  id: ImageProvider;
  label: string;
  detail: string;
}[] = [
  {
    id: "segmind",
    label: "Segmind",
    detail: "FaceSwap-Comic. ~$0.065 per page. No content gate on children's photos.",
  },
  {
    id: "openai",
    label: "OpenAI",
    detail:
      "gpt-image-1 face-crop edit. Only the traced face area is sent; the rest of the page is kept byte-identical.",
  },
];

export default function AdminSettingsPage() {
  const [s, setS] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);

  // WhatsApp number behind the site's chat button
  const [waInput, setWaInput] = useState("");
  const [savingWa, setSavingWa] = useState(false);
  const [waMsg, setWaMsg] = useState<string | null>(null);

  // Image provider selector
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerMsg, setProviderMsg] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getSettings()
      .then((v) => {
        setS(v);
        setWaInput(v.whatsappNumber || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveWhatsApp() {
    setSavingWa(true);
    setWaMsg(null);
    try {
      const updated = await adminApi.updateSettings({ whatsappNumber: waInput });
      setS(updated);
      setWaInput(updated.whatsappNumber || "");
      setWaMsg("Saved — the chat button uses this straight away ✓");
    } catch (e) {
      setWaMsg(e instanceof Error ? e.message : "Failed to save the number");
    } finally {
      setSavingWa(false);
    }
  }

  async function toggleFaceOutline() {
    if (!s) return;
    setSavingToggle(true);
    try {
      const updated = await adminApi.updateSettings({
        faceOutlineEnabled: !s.faceOutlineEnabled,
      });
      setS(updated);
    } catch {
      alert("Failed to update setting");
    } finally {
      setSavingToggle(false);
    }
  }

  async function chooseProvider(id: ImageProvider) {
    if (!s || s.imageProvider === id) return;
    setSavingProvider(true);
    setProviderMsg(null);
    try {
      const updated = await adminApi.updateSettings({ imageProvider: id });
      setS(updated);
      setProviderMsg(
        `Now rendering with ${id === "openai" ? "OpenAI" : "Segmind"} — applies to the next render ✓`,
      );
    } catch (e) {
      // The API refuses a provider with no key set, and says which.
      setProviderMsg(e instanceof Error ? e.message : "Failed to switch provider");
    } finally {
      setSavingProvider(false);
    }
  }

  if (loading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-primary" />
      </div>
    );
  }
  if (!s) {
    return (
      <div className="card p-8 text-center text-slate-mutedText">
        Couldn&apos;t load settings.
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-deep">Settings</h1>

      {/* WhatsApp number */}
      <div className="card mb-6 p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-lilac text-brand-primary">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-bold text-slate-deep">WhatsApp number</h2>
            <p className="mt-1 text-sm text-slate-mutedText">
              Behind the green chat button on every storefront page. Include the
              country code — 90031 69615 in India is <b>919003169615</b>. Spaces,
              dashes and a leading + are cleaned up for you.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={waInput}
                onChange={(e) => setWaInput(e.target.value)}
                placeholder="919003169615"
                inputMode="tel"
                className="w-56 rounded-xl border-2 border-brand-borderAccent px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
              <button
                onClick={saveWhatsApp}
                disabled={savingWa || waInput === (s.whatsappNumber || "")}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
              >
                {savingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </button>
              {s.whatsappNumber && (
                <a
                  href={`https://wa.me/${s.whatsappNumber}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-brand-primary hover:underline"
                >
                  Test this number →
                </a>
              )}
            </div>
            {waMsg && (
              <p className="mt-2 text-sm font-semibold text-slate-mutedText">{waMsg}</p>
            )}
          </div>
        </div>
      </div>

      {/* Image provider */}
      <div className="card mb-6 p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-lilac text-brand-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-bold text-slate-deep">Image provider</h2>
            <p className="mt-1 text-sm text-slate-mutedText">
              Which service puts the child&apos;s face onto a page&apos;s base
              artwork. Switch freely to compare the two — it takes effect on the
              next render, so re-render a job to see the difference.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PROVIDERS.map((p) => {
                const active = s.imageProvider === p.id;
                const keyed = p.id === "openai" ? s.openai.set : s.segmind.set;
                return (
                  <button
                    key={p.id}
                    onClick={() => chooseProvider(p.id)}
                    disabled={savingProvider}
                    aria-pressed={active}
                    className={`rounded-xl border-2 p-3 text-left transition disabled:opacity-60 ${
                      active
                        ? "border-brand-primary bg-brand-lilac/40"
                        : "border-brand-borderAccent hover:border-brand-primary/50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-slate-deep">{p.label}</span>
                      {active && (
                        <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-bold text-white">
                          ACTIVE
                        </span>
                      )}
                      {!keyed && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                          NO KEY
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-slate-mutedText">
                      {p.detail}
                    </span>
                  </button>
                );
              })}
            </div>

            {providerMsg && (
              <p className="mt-3 text-sm font-semibold text-slate-mutedText">
                {providerMsg}
              </p>
            )}

            <p className="mt-3 text-xs text-slate-400">
              On OpenAI, free preview pages render at a lower quality tier than the
              paid render, and identical inputs are served from a cache — so a
              re-render of the same page never bills twice.
            </p>
          </div>
        </div>
      </div>

      {/* Face outline toggle */}
      <div className="card mb-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-lilac text-brand-primary">
              <ScanFace className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-bold text-slate-deep">Face outline (hair-keeping)</h2>
              <p className="mt-1 text-sm text-slate-mutedText">
                When ON, the Page Editor lets you trace a face outline and the swap
                is masked to it, keeping the template&apos;s hair. When OFF, the
                whole head is swapped everywhere (outlines are ignored).
              </p>
              <p className="mt-2 text-xs text-slate-400">
                On the OpenAI provider this outline also decides how much of the
                page is sent for editing — with it ON, only the traced area is
                regenerated, which is both cheaper and what keeps the artwork
                identical from page to page.
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={s.faceOutlineEnabled}
            onClick={toggleFaceOutline}
            disabled={savingToggle}
            className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${
              s.faceOutlineEnabled ? "bg-brand-primary" : "bg-slate-300"
            } disabled:opacity-60`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                s.faceOutlineEnabled ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-mutedText">
          Currently: {s.faceOutlineEnabled ? "ON — outlines applied" : "OFF — full-head swap"}
        </p>
      </div>

      <ApiKeyCard
        title="Segmind API key"
        blurb={
          <>
            Used for the FaceSwap-Comic face-swap. Stored{" "}
            <b>encrypted at rest</b> and never shown again after saving.
          </>
        }
        placeholder="Paste new Segmind API key"
        status={s.segmind}
        onSave={async (key) => setS(await adminApi.updateSettings({ segmindApiKey: key }))}
      />

      <ApiKeyCard
        title="OpenAI API key"
        blurb={
          <>
            Used for gpt-image-1 face personalization and the AI story author.
            Stored <b>encrypted at rest</b> and never shown again after saving.
          </>
        }
        placeholder="sk-..."
        status={s.openai}
        onSave={async (key) => setS(await adminApi.updateSettings({ openaiApiKey: key }))}
      />

      <p className="text-xs text-slate-400">
        Best practice: this panel is admin-only and keys are write-only (never
        returned). Always access admin over HTTPS in production.
      </p>
    </div>
  );
}
