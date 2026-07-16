"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { adminApi, type AdminPage, type AdminStory } from "@/lib/admin";

const BLANK = (n: number): AdminPage => ({
  pageNumber: n,
  baseImageUrl: null,
  stylePrompt:
    "children's storybook illustration, soft colours, consistent character, clean line art",
  faceX: null,
  faceY: null,
  faceW: null,
  faceH: null,
  scenePrompt: "",
  storyText: "",
  textX: 50,
  textY: 82,
  fontSize: 42,
  fontColor: "#FFFFFF",
});

export default function AdminPagesEditor() {
  const searchParams = useSearchParams();
  const initialSlug = searchParams.get("slug") || "";
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [slug, setSlug] = useState<string>(initialSlug);
  const [pages, setPages] = useState<AdminPage[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [authoring, setAuthoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminApi
      .stories()
      .then((s) => {
        setStories(s);
        // Honour ?slug= (from "Author pages"); else default to the first book.
        if (initialSlug && s.some((x) => x.slug === initialSlug)) {
          setSlug(initialSlug);
        } else if (s[0]) {
          setSlug(s[0].slug);
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!slug) return;
    adminApi.pages(slug).then((p) => {
      setPages(p.length ? p : [BLANK(1)]);
      setActive(0);
    });
  }, [slug]);

  const page = pages[active];
  const preview = useMemo(
    () => (page?.storyText || "").replace(/\{\{name\}\}/gi, "Aarav"),
    [page?.storyText],
  );

  function patch(field: keyof AdminPage, value: string | number | null) {
    setPages((prev) =>
      prev.map((p, i) => (i === active ? { ...p, [field]: value } : p)),
    );
  }

  async function uploadBaseArt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await adminApi.upload(file);
      patch("baseImageUrl", url);
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!page) return;
    setSaving(true);
    try {
      const saved = await adminApi.upsertPage(slug, page);
      setPages((prev) => prev.map((p, i) => (i === active ? saved : p)));
      return saved;
    } catch {
      alert("Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Generate the page's GENERIC base illustration once via flux txt2img.
  // Costs one Replicate render. Saves the page first so the endpoint can find it.
  async function generateBaseArt() {
    if (!page) return;
    if (!page.scenePrompt.trim()) {
      alert("Add a scene prompt first — it describes the base illustration.");
      return;
    }
    if (
      !confirm(
        "Generate base art via Replicate (flux txt2img)? This spends ~a few cents.",
      )
    )
      return;
    setGenerating(true);
    try {
      await adminApi.upsertPage(slug, page); // ensure the page exists server-side
      const updated = await adminApi.generateBase(slug, page.pageNumber);
      setPages((prev) => prev.map((p, i) => (i === active ? updated : p)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Base-art generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function addPage() {
    const next = (pages[pages.length - 1]?.pageNumber || 0) + 1;
    setPages((prev) => [...prev, BLANK(next)]);
    setActive(pages.length);
  }

  // Author a full, coherent, personalized story for the whole book via an LLM.
  // Overwrites the book's pages with the generated narrative + scene prompts.
  async function generateStory() {
    const numPages = Number(
      prompt("How many pages should the story have? (matches your free-preview count)", "13"),
    );
    if (!numPages || numPages < 1) return;
    const premise = prompt(
      "Optional: describe the story premise (leave blank to use the book's description).",
      "",
    );
    if (
      !confirm(
        `Generate a full ${numPages}-page story with AI? This overwrites this book's pages (1 LLM call, ~a few cents).`,
      )
    )
      return;
    setAuthoring(true);
    try {
      const res = await adminApi.generateStory(slug, {
        numPages,
        premise: premise || undefined,
      });
      setPages(res.pages);
      setActive(0);
      alert(`Authored ${res.count} pages via ${res.provider}. Review & tweak, then run a preview.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Story generation failed");
    } finally {
      setAuthoring(false);
    }
  }

  async function removePage() {
    if (!page) return;
    if (page.id) await adminApi.deletePage(slug, page.pageNumber).catch(() => {});
    setPages((prev) => prev.filter((_, i) => i !== active));
    setActive((a) => Math.max(0, a - 1));
  }

  if (loading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-deep">Page Editor (CMS)</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={generateStory}
            disabled={authoring || !slug}
            title="Author a full personalized story for this book with AI"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {authoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            Generate full story (AI)
          </button>
          <button
            onClick={async () => {
              if (
                !confirm(
                  "Generate FIXED base illustrations for every page? This makes the child render consistently onto the same art each page (Diffrun-exact). Costs one render per page.",
                )
              )
                return;
              try {
                const r = await adminApi.generateBaseArt(slug);
                alert(`Generating base art for ${r.pages} pages in the background. Refresh in a minute.`);
              } catch (e) {
                alert(e instanceof Error ? e.message : "Failed to start base-art generation");
              }
            }}
            disabled={!slug}
            title="Generate the fixed base illustration for every page (one-time)"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-brand-primary px-4 py-2 text-sm font-bold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" /> Base art (all pages)
          </button>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="rounded-xl border-2 border-brand-borderAccent bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-brand-primary"
          >
            {stories.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Page tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {pages.map((p, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`h-9 w-9 rounded-lg text-sm font-bold transition ${
              i === active
                ? "bg-brand-primary text-white"
                : "border-2 border-brand-borderAccent text-slate-mutedText hover:border-brand-primary"
            }`}
          >
            {p.pageNumber}
          </button>
        ))}
        <button
          onClick={addPage}
          className="grid h-9 w-9 place-items-center rounded-lg border-2 border-dashed border-brand-primary text-brand-primary"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {page && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Form */}
          <div className="card space-y-4 p-6">
            <Field label="Page number">
              <input
                type="number"
                value={page.pageNumber}
                onChange={(e) => patch("pageNumber", Number(e.target.value))}
                className="input"
              />
            </Field>

            {/* Base illustration (inpaint-over-template) */}
            <Field label="Base illustration (the fixed scene; child's face is inpainted in)">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={uploadBaseArt}
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-primary py-3 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {page.baseImageUrl ? "Replace base art" : "Upload base art"}
                </button>
                <button
                  type="button"
                  onClick={generateBaseArt}
                  disabled={generating}
                  title="Generate a generic base illustration via flux txt2img (costs ~a few cents)"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-brand-primary bg-brand-primary/5 py-3 text-sm font-semibold text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate base art (AI)
                </button>
              </div>
              {page.baseImageUrl && (
                <p className="mt-1 truncate text-xs text-slate-400">
                  {page.baseImageUrl}
                </p>
              )}
            </Field>

            <Field label="Style prompt (illustration style for the inpainted face)">
              <input
                value={page.stylePrompt}
                onChange={(e) => patch("stylePrompt", e.target.value)}
                className="input"
              />
            </Field>

            <Field label="Face region % — X, Y, W, H (leave blank for auto-detect)">
              <div className="grid grid-cols-4 gap-2">
                {(["faceX", "faceY", "faceW", "faceH"] as const).map((k, idx) => (
                  <input
                    key={k}
                    type="number"
                    placeholder={["X", "Y", "W", "H"][idx]}
                    value={(page[k] as number | null) ?? ""}
                    onChange={(e) =>
                      patch(k, e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="input"
                  />
                ))}
              </div>
            </Field>

            <Field label="Fallback scene prompt (txt2img, only if no base art)">
              <textarea
                value={page.scenePrompt}
                onChange={(e) => patch("scenePrompt", e.target.value)}
                rows={3}
                placeholder="a cozy treehouse at golden hour, storybook illustration, soft light"
                className="input"
              />
            </Field>
            <Field label="Story text (use {{name}} for the child's name)">
              <input
                value={page.storyText}
                onChange={(e) => patch("storyText", e.target.value)}
                placeholder="{{name}} climbed up to the treehouse."
                className="input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Text X (%)">
                <input
                  type="number"
                  step="0.5"
                  value={page.textX}
                  onChange={(e) => patch("textX", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Text Y (%)">
                <input
                  type="number"
                  step="0.5"
                  value={page.textY}
                  onChange={(e) => patch("textY", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Font size (px @1024)">
                <input
                  type="number"
                  value={page.fontSize}
                  onChange={(e) => patch("fontSize", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Font color">
                <input
                  type="color"
                  value={page.fontColor}
                  onChange={(e) => patch("fontColor", e.target.value)}
                  className="h-10 w-full rounded-xl border-2 border-brand-borderAccent"
                />
              </Field>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Save page
                  </>
                )}
              </button>
              <button
                onClick={removePage}
                className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-red-200 text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Live placement preview */}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-mutedText">
              Live text placement (4:3 canvas)
            </p>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-brand-borderAccent bg-gradient-to-br from-brand-magenta via-brand-primary to-brand-purple">
              {page.baseImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={page.baseImageUrl}
                  alt="Base illustration"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              {/* Face inpaint region */}
              {page.faceX != null && page.faceW != null && (
                <div
                  className="absolute border-2 border-dashed border-white/90 bg-white/10"
                  style={{
                    left: `${page.faceX}%`,
                    top: `${page.faceY ?? 0}%`,
                    width: `${page.faceW}%`,
                    height: `${page.faceH ?? 0}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 rounded bg-black/60 px-1 text-[10px] font-bold text-white">
                    face
                  </span>
                </div>
              )}
              <div
                className="absolute w-[86%] -translate-x-1/2 -translate-y-1/2 text-center"
                style={{
                  left: `${page.textX}%`,
                  top: `${page.textY}%`,
                  color: page.fontColor,
                  fontSize: `clamp(12px, ${page.fontSize / 12}vw, 34px)`,
                  textShadow: "0 2px 6px rgba(0,0,0,0.6)",
                  fontWeight: 700,
                }}
              >
                {preview || "Your story text appears here"}
              </div>
              <div
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-black/40"
                style={{ left: `${page.textX}%`, top: `${page.textY}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              With base art set, the engine face-swaps the child onto this fixed
              illustration; otherwise it renders the scene prompt via FLUX+PuLID.
              Then PIL burns this text at ({page.textX}%, {page.textY}%).
            </p>
          </div>
        </div>
      )}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.75rem;
          border: 2px solid #ebd9f7;
          padding: 0.55rem 0.8rem;
          font-size: 0.9rem;
          outline: none;
          background: #fff;
        }
        :global(.input:focus) {
          border-color: #9333ea;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-deep">
        {label}
      </span>
      {children}
    </label>
  );
}
