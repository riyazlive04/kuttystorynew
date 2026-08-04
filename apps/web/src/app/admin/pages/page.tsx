"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import {
  adminApi,
  BACK_COVER,
  FRONT_COVER,
  VARIANTS,
  type AdminFont,
  type AdminPage,
  type AdminStory,
  type Variant,
} from "@/lib/admin";

// The canvas width the stored fontSize/letterSpacing are authored against — the
// text layer scales both by (imageWidth / 1024) when it burns the text in.
const DESIGN_W = 1024;

// Shown until GET /admin/fonts answers; keys match text_layer.FONT_FAMILIES.
const FALLBACK_FONTS: AdminFont[] = [
  {
    key: "sans",
    label: "Sans (DejaVu Bold)",
    css: "'DejaVu Sans', 'Segoe UI', system-ui, sans-serif",
    installed: true,
  },
];

const BLANK = (n: number): AdminPage => ({
  pageNumber: n,
  baseImageUrl: null,
  stylePrompt:
    "children's storybook illustration, soft colours, consistent character, clean line art",
  faceX: null,
  faceY: null,
  faceW: null,
  faceH: null,
  facePath: null,
  scenePrompt: "",
  storyText: "",
  textX: 50,
  textY: 82,
  fontSize: 42,
  fontColor: "#FFFFFF",
  fontFamily: "sans",
  letterSpacing: 0,
  softLineBreak: true,
  outlineWidth: 3,
});

// A cover is an ordinary page template at a reserved number — same base art,
// face outline, face swap and text layer as any story page.
const BLANK_COVER = (n: number): AdminPage => ({
  ...BLANK(n),
  kind: n === FRONT_COVER ? "front_cover" : "back_cover",
  storyText: n === FRONT_COVER ? "{{name}}" : "",
  textY: n === FRONT_COVER ? 88 : 50,
  fontSize: n === FRONT_COVER ? 64 : 36,
});

function tabLabel(p: AdminPage): string {
  if (p.pageNumber === FRONT_COVER) return "Front";
  if (p.pageNumber === BACK_COVER) return "Back";
  return String(p.pageNumber);
}

function isCover(p: AdminPage | undefined): boolean {
  return p?.pageNumber === FRONT_COVER || p?.pageNumber === BACK_COVER;
}

export default function AdminPagesEditor() {
  const searchParams = useSearchParams();
  const initialSlug = searchParams.get("slug") || "";
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [slug, setSlug] = useState<string>(initialSlug);
  const [variant, setVariant] = useState<Variant>("boy");
  const [pages, setPages] = useState<AdminPage[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [authoring, setAuthoring] = useState(false);
  const [faceOutlineOn, setFaceOutlineOn] = useState(true);
  const [fonts, setFonts] = useState<AdminFont[]>(FALLBACK_FONTS);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminApi
      .getSettings()
      .then((s) => setFaceOutlineOn(s.faceOutlineEnabled))
      .catch(() => {});
    adminApi
      .fonts()
      .then((f) => f.length && setFonts(f))
      .catch(() => {});
  }, []);

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
    adminApi.pages(slug, variant).then((p) => {
      setPages(p.length ? p : [BLANK(1)]);
      setActive(0);
    });
  }, [slug, variant]);

  const page = pages[active];
  const softBreak = page?.softLineBreak ?? true;
  // Same split the text layer uses: sentence end followed by whitespace.
  const previewLines = useMemo(() => {
    const text = (page?.storyText || "").replace(/\{\{name\}\}/gi, "Aarav").trim();
    if (!text) return [];
    return softBreak ? text.split(/(?<=[.!?])\s+/).filter(Boolean) : [text];
  }, [page?.storyText, softBreak]);

  function patch(
    field: keyof AdminPage,
    value: string | number | boolean | null,
  ) {
    setPages((prev) =>
      prev.map((p, i) => (i === active ? { ...p, [field]: value } : p)),
    );
  }

  function patchMany(vals: Partial<AdminPage>) {
    setPages((prev) => prev.map((p, i) => (i === active ? { ...p, ...vals } : p)));
  }

  // Freehand LASSO: trace the face outline directly on the preview — no numbers.
  const previewRef = useRef<HTMLDivElement>(null);
  const livePathRef = useRef<number[][]>([]);

  // Track the preview box's real pixel width so the text can be scaled by
  // (boxWidth / 1024) — exactly what the PIL text layer does with the rendered
  // image width. Sizing it off the viewport (vw) instead made the type resize
  // with the window and never matched the burned-in result.
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setBoxW(entry.contentRect.width),
    );
    ro.observe(el);
    setBoxW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const pxScale = (boxW || DESIGN_W) / DESIGN_W;
  const outlinePx = Math.round((page?.outlineWidth ?? 3) * pxScale);
  const [tracing, setTracing] = useState(false);
  const [livePath, setLivePath] = useState<number[][]>([]);
  const r1 = (n: number) => Math.round(n * 10) / 10;

  function setPts(pts: number[][]) {
    livePathRef.current = pts;
    setLivePath(pts);
  }
  function pctFromEvent(e: React.MouseEvent) {
    const r = previewRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  }
  function faceDown(e: React.MouseEvent) {
    if (!page?.baseImageUrl || !faceOutlineOn) return;
    const { x, y } = pctFromEvent(e);
    setTracing(true);
    setPts([[r1(x), r1(y)]]);
  }
  function faceMove(e: React.MouseEvent) {
    if (!tracing) return;
    const { x, y } = pctFromEvent(e);
    const pts = livePathRef.current;
    const last = pts[pts.length - 1];
    // Throttle: only add a point after ~0.8% of movement, keeps the path light.
    if (last && Math.abs(last[0] - x) < 0.8 && Math.abs(last[1] - y) < 0.8) return;
    setPts([...pts, [r1(x), r1(y)]]);
  }
  function faceUp() {
    if (!tracing) return;
    setTracing(false);
    const pts = livePathRef.current;
    if (pts.length >= 3) {
      patchMany({
        facePath: pts,
        faceX: null,
        faceY: null,
        faceW: null,
        faceH: null,
      });
    }
    setPts([]);
  }
  function clearFace() {
    patchMany({
      facePath: null,
      faceX: null,
      faceY: null,
      faceW: null,
      faceH: null,
    });
    setPts([]);
  }
  // What to render: the live trace while dragging, else the saved outline.
  const shownPath = tracing ? livePath : page?.facePath ?? [];

  const story = stories.find((x) => x.slug === slug);
  const lock = story?.genderLock ?? null;

  // Two checkboxes, one underlying value: ticking one unticks the other, and
  // neither ticked means the book is offered for any child.
  async function setLock(next: Variant | null) {
    if (!slug) return;
    setStories((prev) =>
      prev.map((x) => (x.slug === slug ? { ...x, genderLock: next } : x)),
    );
    try {
      await adminApi.setGenderLock(slug, next);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save that");
      setStories((prev) =>
        prev.map((x) => (x.slug === slug ? { ...x, genderLock: lock } : x)),
      );
    }
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
      const saved = await adminApi.upsertPage(slug, page, variant);
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
      await adminApi.upsertPage(slug, page, variant); // ensure it exists server-side
      const updated = await adminApi.generateBase(slug, page.pageNumber, variant);
      setPages((prev) => prev.map((p, i) => (i === active ? updated : p)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Base-art generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const hasFront = pages.some((p) => p.pageNumber === FRONT_COVER);
  const hasBack = pages.some((p) => p.pageNumber === BACK_COVER);

  function addPage() {
    const storyNums = pages
      .filter((p) => p.pageNumber >= 1)
      .map((p) => p.pageNumber);
    const next = (storyNums.length ? Math.max(...storyNums) : 0) + 1;
    // Keep reading order: a new story page goes before the back cover.
    const at = hasBack ? pages.length - 1 : pages.length;
    setPages((prev) => [...prev.slice(0, at), BLANK(next), ...prev.slice(at)]);
    setActive(at);
  }

  function addCover(n: number) {
    if (n === FRONT_COVER) {
      setPages((prev) => [BLANK_COVER(n), ...prev]);
      setActive(0);
    } else {
      setActive(pages.length);
      setPages((prev) => [...prev, BLANK_COVER(n)]);
    }
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
        `Generate a full ${numPages}-page story with AI? This overwrites this book's ${variant} pages (1 LLM call, ~a few cents).`,
      )
    )
      return;
    setAuthoring(true);
    try {
      const res = await adminApi.generateStory(slug, {
        numPages,
        premise: premise || undefined,
        variant,
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
    if (page.id)
      await adminApi.deletePage(slug, page.pageNumber, variant).catch(() => {});
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
            Generate full story (AI) — {variant}
          </button>
          <button
            onClick={async () => {
              if (
                !confirm(
                  `Generate FIXED base illustrations for every ${variant} page? This makes the child render consistently onto the same art each page (Diffrun-exact). Costs one render per page.`,
                )
              )
                return;
              try {
                const r = await adminApi.generateBaseArt(slug, variant);
                alert(`Generating base art for ${r.pages} pages in the background. Refresh in a minute.`);
              } catch (e) {
                alert(e instanceof Error ? e.message : "Failed to start base-art generation");
              }
            }}
            disabled={!slug}
            title="Generate the fixed base illustration for every page (one-time)"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-brand-primary px-4 py-2 text-sm font-bold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" /> Base art (all {variant} pages)
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

      {/* Who this book is offered to */}
      <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <span className="text-sm font-bold text-slate-deep">Available for</span>
        {VARIANTS.map((v) => (
          <label key={v} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={lock === v}
              onChange={(e) => setLock(e.target.checked ? v : null)}
              className="h-4 w-4 accent-brand-primary"
            />
            <span className="text-sm font-semibold capitalize text-slate-deep">
              {v} only
            </span>
          </label>
        ))}
        <span className="text-xs text-slate-mutedText">
          {lock
            ? `The storefront only offers this book for a ${lock}.`
            : "Neither ticked — offered for both boys and girls."}
        </span>
      </div>

      {/* Which gender's artwork is being authored */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl border-2 border-brand-primary">
          {VARIANTS.map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              title={`Author the ${v} artwork`}
              className={`h-9 px-4 text-sm font-bold capitalize transition ${
                variant === v
                  ? "bg-brand-primary text-white"
                  : "bg-white text-brand-primary hover:bg-brand-primary/5"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="mr-2 text-xs text-slate-mutedText">
          Separate pages &amp; base art per gender
        </span>
        <span className="mx-1 h-7 w-px bg-brand-borderAccent" />
        {pages.map((p, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            title={p.label || `Page ${p.pageNumber}`}
            className={`h-9 rounded-lg text-sm font-bold transition ${
              isCover(p) ? "px-3" : "w-9"
            } ${
              i === active
                ? "bg-brand-primary text-white"
                : isCover(p)
                  ? "border-2 border-brand-primary/60 text-brand-primary hover:border-brand-primary"
                  : "border-2 border-brand-borderAccent text-slate-mutedText hover:border-brand-primary"
            }`}
          >
            {tabLabel(p)}
          </button>
        ))}
        <button
          onClick={addPage}
          title="Add a story page"
          className="grid h-9 w-9 place-items-center rounded-lg border-2 border-dashed border-brand-primary text-brand-primary"
        >
          <Plus className="h-4 w-4" />
        </button>
        {!hasFront && (
          <button
            onClick={() => addCover(FRONT_COVER)}
            title="Add a personalized front cover — face-swapped and named like any page"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-dashed border-brand-primary px-3 text-xs font-bold text-brand-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Front cover
          </button>
        )}
        {!hasBack && (
          <button
            onClick={() => addCover(BACK_COVER)}
            title="Add a personalized back cover"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-dashed border-brand-primary px-3 text-xs font-bold text-brand-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Back cover
          </button>
        )}
      </div>

      {page && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Form */}
          <div className="card space-y-4 p-6">
            {isCover(page) ? (
              <div className="rounded-xl border-2 border-brand-primary/40 bg-brand-primary/5 p-3">
                <p className="text-sm font-bold text-brand-primary">
                  {page.pageNumber === FRONT_COVER ? "Front cover" : "Back cover"}
                </p>
                <p className="mt-0.5 text-xs text-slate-mutedText">
                  A real page in the book: the child&apos;s face is swapped into the
                  base art below and the text is burned in, exactly like a story
                  page.{" "}
                  {page.pageNumber === FRONT_COVER
                    ? "It reads first and is part of the free preview."
                    : "It reads last and unlocks after purchase."}
                </p>
                {page.pageNumber === FRONT_COVER && (
                  <p className="mt-1.5 text-xs font-semibold text-brand-primary">
                    Its base art is also the book&apos;s shop image — saving it
                    updates the storefront card, cart and checkout.
                  </p>
                )}
              </div>
            ) : (
              <Field label="Page number">
                <input
                  type="number"
                  value={page.pageNumber}
                  onChange={(e) => patch("pageNumber", Number(e.target.value))}
                  className="input"
                />
              </Field>
            )}

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

            {!faceOutlineOn ? (
              <Field label="Face outline">
                <p className="rounded-xl border-2 border-dashed border-brand-borderAccent bg-slate-50 p-3 text-xs text-slate-mutedText">
                  Face-outline tracing is <b>turned off in Settings</b> — the whole
                  head is swapped (hair changes too). Enable it in{" "}
                  <b>Settings</b> to keep the template&apos;s hair.
                </p>
              </Field>
            ) : (
            <Field label="Face outline — TRACE around the face on the preview →">
              <p className="mb-2 text-xs text-slate-mutedText">
                Press and drag to <b>trace a free-form outline</b> around the{" "}
                <b>face only</b> (follow the jaw &amp; hairline, <b>exclude the
                hair</b>). The swap fills exactly inside your outline, so the
                template&apos;s hair is kept. Leave blank to swap the whole head.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-mutedText">
                  {page.facePath && page.facePath.length >= 3
                    ? `Outline set (${page.facePath.length} points) ✓`
                    : tracing
                      ? "Tracing…"
                      : "No outline yet"}
                </span>
                {(page.facePath || page.faceX != null) && (
                  <button
                    onClick={clearFace}
                    className="rounded-xl border-2 border-brand-borderAccent px-3 py-1.5 text-xs font-bold text-slate-mutedText hover:border-brand-primary hover:text-brand-primary"
                  >
                    Clear outline
                  </button>
                )}
              </div>
            </Field>
            )}

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
              <Field label="Font">
                <select
                  value={page.fontFamily || "sans"}
                  onChange={(e) => patch("fontFamily", e.target.value)}
                  className="input"
                >
                  {fonts.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                      {f.installed ? "" : " (not installed — falls back)"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Letter spacing (px @1024)">
                <input
                  type="number"
                  step="0.5"
                  value={page.letterSpacing ?? 0}
                  onChange={(e) => patch("letterSpacing", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Outline (px @1024 — 0 = none)">
                <input
                  type="number"
                  min="0"
                  value={page.outlineWidth ?? 3}
                  onChange={(e) =>
                    patch("outlineWidth", Math.max(0, Number(e.target.value)))
                  }
                  className="input"
                />
              </Field>
            </div>
            {(page.outlineWidth ?? 3) > 0 && (
              <p className="-mt-2 text-xs text-slate-mutedText">
                The outline and drop shadow keep light text readable over
                artwork. If this page has a light panel behind the text, set the
                outline to <b>0</b> and pick a dark font colour instead.
              </p>
            )}

            <label className="flex items-start gap-3 rounded-xl border-2 border-brand-borderAccent p-3">
              <input
                type="checkbox"
                checked={softBreak}
                onChange={(e) => patch("softLineBreak", e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-primary"
              />
              <span className="text-sm">
                <b className="text-slate-deep">Soft line break</b>
                <span className="block text-xs text-slate-mutedText">
                  Start a new line at the end of every sentence. Turn off to let
                  the text flow and wrap only when it runs out of width.
                </span>
              </span>
            </label>

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
              Live preview (square) — {page.baseImageUrl ? "trace the face outline (press & drag)" : "text placement"}
            </p>
            <div
              ref={previewRef}
              onMouseDown={faceDown}
              onMouseMove={faceMove}
              onMouseUp={faceUp}
              onMouseLeave={faceUp}
              className={`relative aspect-square w-full select-none overflow-hidden rounded-2xl border-2 border-brand-borderAccent bg-gradient-to-br from-brand-magenta via-brand-primary to-brand-purple ${
                page.baseImageUrl && faceOutlineOn ? "cursor-crosshair" : ""
              }`}
            >
              {page.baseImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={page.baseImageUrl}
                  alt="Base illustration"
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
              )}
              {/* Free-form face outline (lasso) */}
              {shownPath.length >= 2 && (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  <polygon
                    points={shownPath.map((p) => `${p[0]},${p[1]}`).join(" ")}
                    fill="rgba(16,185,129,0.22)"
                    stroke="#34d399"
                    strokeWidth={0.7}
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <div
                className="pointer-events-none absolute w-[86%] -translate-x-1/2 -translate-y-1/2 text-center"
                style={{
                  left: `${page.textX}%`,
                  top: `${page.textY}%`,
                  color: page.fontColor,
                  // Scaled the same way the renderer does — no viewport units,
                  // so the preview no longer resizes with the browser window.
                  fontSize: `${Math.max(6, page.fontSize * pxScale)}px`,
                  letterSpacing: `${(page.letterSpacing ?? 0) * pxScale}px`,
                  lineHeight: 1.25,
                  fontFamily:
                    fonts.find((f) => f.key === (page.fontFamily || "sans"))?.css ||
                    "system-ui, sans-serif",
                  // Mirror the render: an outline ring + soft shadow, or
                  // nothing at all when the outline is turned off.
                  textShadow: outlinePx
                    ? [
                        `-${outlinePx}px -${outlinePx}px 0 #000`,
                        `${outlinePx}px -${outlinePx}px 0 #000`,
                        `-${outlinePx}px ${outlinePx}px 0 #000`,
                        `${outlinePx}px ${outlinePx}px 0 #000`,
                        `0 ${outlinePx * 1.5}px ${outlinePx * 2}px rgba(0,0,0,0.45)`,
                      ].join(", ")
                    : "none",
                  fontWeight: 700,
                }}
              >
                {previewLines.length ? (
                  previewLines.map((line, i) => <div key={i}>{line}</div>)
                ) : (
                  <span>Your story text appears here</span>
                )}
              </div>
              <div
                className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-black/40"
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
