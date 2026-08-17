"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2, MessageCircle, ScanFace } from "lucide-react";
import { adminApi, type AdminSettings } from "@/lib/admin";

export default function AdminSettingsPage() {
  const [s, setS] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);

  // WhatsApp number behind the site's chat button
  const [waInput, setWaInput] = useState("");
  const [savingWa, setSavingWa] = useState(false);
  const [waMsg, setWaMsg] = useState<string | null>(null);

  // Segmind key form (write-only; never pre-filled with the actual key)
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);

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

  async function saveKey() {
    setSavingKey(true);
    setKeyMsg(null);
    try {
      const updated = await adminApi.updateSettings({ segmindApiKey: keyInput.trim() });
      setS(updated);
      setKeyInput("");
      setShowKey(false);
      setKeyMsg(keyInput.trim() ? "Segmind key saved securely ✓" : "Segmind key cleared");
    } catch {
      setKeyMsg("Failed to save key");
    } finally {
      setSavingKey(false);
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
    return <div className="card p-8 text-center text-slate-mutedText">Couldn&apos;t load settings.</div>;
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
              <p className="mt-2 text-sm font-semibold text-slate-mutedText">
                {waMsg}
              </p>
            )}
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

      {/* Segmind API key */}
      <div className="card p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-lilac text-brand-primary">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-bold text-slate-deep">Segmind API key</h2>
            <p className="mt-1 text-sm text-slate-mutedText">
              Used for the face-swap. Stored <b>encrypted at rest</b> and never shown
              again after saving.
            </p>

            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-deep">Status:</span>
              {s.segmind.set ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> Set ••••{s.segmind.last4}
                  <span className="font-medium text-emerald-600/80">
                    ({s.segmind.source === "admin" ? "admin-set" : "from environment"})
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
                {s.segmind.set ? "Replace key" : "Set key"}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Paste new Segmind API key"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl border-2 border-brand-borderAccent bg-white px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-brand-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-deep"
                    aria-label={showKey ? "Hide" : "Show"}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  onClick={saveKey}
                  disabled={savingKey || !keyInput.trim()}
                  className="btn-primary shrink-0 disabled:opacity-50"
                >
                  {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save key"}
                </button>
              </div>
              {keyMsg && (
                <p className="mt-2 text-xs font-semibold text-slate-mutedText">{keyMsg}</p>
              )}
              <p className="mt-3 text-xs text-slate-400">
                Best practice: this panel is admin-only and the key is write-only
                (never returned). Always access admin over HTTPS in production.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
