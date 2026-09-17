"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import ProviderCompare from "@/components/ProviderCompare";
import {
  adminApi,
  getToken,
  BACK_COVER,
  FRONT_COVER,
  SPINE,
  BLANK_BLOCK,
  BLANK_BOX,
  VARIANTS,
  type AdminFont,
  type AdminPage,
  type AdminStory,
  type AutoTraceRun,
  type TextBlock,
  type TextBox,
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
  warpStyle: "none",
  warpBend: 0,
  warpDistortH: 0,
  warpDistortV: 0,
  warpVertical: false,
});

// A cover is an ordinary page template at a reserved number — same base art,
// face outline, face swap and text layer as any story page.
const BLANK_COVER = (n: number): AdminPage => ({
  ...BLANK(n),
  kind: n === FRONT_COVER ? "front_cover" : n === SPINE ? "spine" : "back_cover",
  storyText: n === FRONT_COVER ? "{{name}}" : "",
  textY: n === FRONT_COVER ? 88 : 50,
  fontSize: n === FRONT_COVER ? 64 : 36,
});

function tabLabel(p: AdminPage): string {
  if (p.pageNumber === FRONT_COVER) return "Front";
  if (p.pageNumber === BACK_COVER) return "Back";
  if (p.pageNumber === SPINE) return "Spine";
  return String(p.pageNumber);
}

// Mirrors text_layer.outline_color: the halo must contrast with the text, or a
// black outline around black text just smears the glyphs.
function outlineColor(fontColor?: string): string {
  const hex = (fontColor || "#FFFFFF").replace("#", "");
  const full =
    hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex.padEnd(6, "0").slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
  return 0.299 * r + 0.587 * g + 0.114 * b >= 140 ? "#000" : "#FFF";
}

function isCover(p: AdminPage | undefined): boolean {
  return (
    p?.pageNumber === FRONT_COVER ||
    p?.pageNumber === BACK_COVER ||
    p?.pageNumber === SPINE
  );
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
  // Any edit to the open page that hasn't been sent to the backend yet.
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const [fontBusy, setFontBusy] = useState(false);

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
      setDirty(false);
    });
  }, [slug, variant]);

  const page = pages[active];

  // Every page is edited as a LIST of styled rows. A page authored before text
  // blocks existed has none, so its single set of text fields becomes row 0 —
  // that's what lets a cover stack three rows in three fonts and colours.
  const legacyBlock = (p: AdminPage): TextBlock => ({
    ...BLANK_BLOCK(),
    text: p.storyText,
    textX: p.textX,
    textY: p.textY,
    fontSize: p.fontSize,
    fontColor: p.fontColor,
    fontFamily: p.fontFamily,
    letterSpacing: p.letterSpacing,
    softLineBreak: p.softLineBreak,
    outlineWidth: p.outlineWidth,
    warpStyle: p.warpStyle,
    warpBend: p.warpBend,
    warpDistortH: p.warpDistortH,
    warpDistortV: p.warpDistortV,
    warpVertical: p.warpVertical,
  });
  const blocks: TextBlock[] = page
    ? page.textBlocks?.length
      ? page.textBlocks
      : [legacyBlock(page)]
    : [];
  const [row, setRow] = useState(0);
  const block = blocks[Math.min(row, blocks.length - 1)] ?? BLANK_BLOCK();

  function setBlocks(next: TextBlock[]) {
    // Row 0 is mirrored back onto the flat fields so anything still reading the
    // old shape (and the fallback in the renderer) stays correct.
    const head = next[0] ?? BLANK_BLOCK();
    setPages((prev) =>
      prev.map((p, i) =>
        i === active
          ? {
              ...p,
              textBlocks: next,
              storyText: head.text,
              textX: head.textX,
              textY: head.textY,
              fontSize: head.fontSize,
              fontColor: head.fontColor,
              fontFamily: head.fontFamily,
              letterSpacing: head.letterSpacing,
              softLineBreak: head.softLineBreak,
              outlineWidth: head.outlineWidth,
              warpStyle: head.warpStyle,
              warpBend: head.warpBend,
              warpDistortH: head.warpDistortH,
              warpDistortV: head.warpDistortV,
              warpVertical: head.warpVertical,
            }
          : p,
      ),
    );
    setDirty(true);
  }

  // The panel belongs to the PAGE — one box framing every row — so it is
  // patched on the page rather than through patchBlock.
  const textBox: TextBox = { ...BLANK_BOX(), ...(page?.textBox ?? {}) };

  function patchBox(field: keyof TextBox, value: string | number | boolean) {
    setPages((prev) =>
      prev.map((p, i) =>
        i === active ? { ...p, textBox: { ...textBox, [field]: value } } : p,
      ),
    );
    setDirty(true);
  }

  function patchBlock(field: keyof TextBlock, value: string | number | boolean) {
    setBlocks(blocks.map((b, i) => (i === row ? { ...b, [field]: value } : b)));
  }

  function addRow() {
    const last = blocks[blocks.length - 1];
    const next = [
      ...blocks,
      { ...BLANK_BLOCK(Math.min(95, (last?.textY ?? 50) + 15)), text: "New row" },
    ];
    setBlocks(next);
    setRow(next.length - 1);
  }

  function removeRow(i: number) {
    if (blocks.length <= 1) return;
    const next = blocks.filter((_, j) => j !== i);
    setBlocks(next);
    setRow(Math.max(0, Math.min(row, next.length - 1)));
  }

  const softBreak = block.softLineBreak ?? true;
  // Same split the text layer uses: sentence end followed by whitespace.
  const previewLines = useMemo(() => {
    const text = (block.text || "").replace(/\{\{name\}\}/gi, "Aarav").trim();
    if (!text) return [];
    return softBreak ? text.split(/(?<=[.!?])\s+/).filter(Boolean) : [text];
  }, [block.text, softBreak]);

  function patch(
    field: keyof AdminPage,
    value: string | number | boolean | null,
  ) {
    setPages((prev) =>
      prev.map((p, i) => (i === active ? { ...p, [field]: value } : p)),
    );
    setDirty(true);
  }

  function patchMany(vals: Partial<AdminPage>) {
    setPages((prev) => prev.map((p, i) => (i === active ? { ...p, ...vals } : p)));
    setDirty(true);
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
  const haloColor = outlineColor(page?.fontColor);
  const warpOn = (block.warpStyle || "none") !== "none";
  // More than one row, or a warp, is beyond what the CSS overlay can show —
  // fall back to the real renderer for an honest preview.
  const serverPreview =
    warpOn || blocks.length > 1 || textBox.enabled;

  // CSS can't reproduce an arc warp, and a preview that disagrees with the
  // render is worse than none — so once warp is on, show the ACTUAL composed
  // page from the server instead of the CSS overlay. Debounced; costs no AI.
  const [warpUrl, setWarpUrl] = useState<string | null>(null);
  const warpKey = serverPreview
    ? JSON.stringify([
        page?.pageNumber, page?.baseImageUrl, page?.storyText, page?.textX,
        page?.textY, page?.fontSize, page?.fontColor, page?.fontFamily,
        page?.letterSpacing, page?.softLineBreak, page?.outlineWidth,
        page?.warpStyle, page?.warpBend, page?.warpDistortH,
        page?.warpDistortV, page?.warpVertical, variant, page?.textBlocks,
        page?.textBox,
      ])
    : "";
  useEffect(() => {
    if (!serverPreview || !page?.baseImageUrl || !slug) {
      setWarpUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    const t = setTimeout(() => {
      adminApi
        .textPreview(slug, page, variant)
        .then((u) => {
          if (cancelled) {
            URL.revokeObjectURL(u);
            return;
          }
          url = u;
          setWarpUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return u;
          });
        })
        .catch(() => {});
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warpKey]);
  const [tracing, setTracing] = useState(false);

  // SAM3 auto-tracing. Slow (minutes per page) and paid, so the button reports
  // what happened per page rather than silently succeeding or failing.
  const [autoTracing, setAutoTracing] = useState(false);
  const [autoTraceMsg, setAutoTraceMsg] = useState<string | null>(null);

  // The run lives on the server (a book is many minutes of SAM3), so this
  // only starts it and then follows it. Also picks up a run that was already
  // going when the editor was opened or reloaded.
  function describeRun(run: AutoTraceRun): string {
    if (run.state === "running") {
      if (run.total == null) return "Starting SAM3…";
      if (run.total === 0) return "Nothing to trace.";
      return `Tracing page ${run.current ?? "…"} (${(run.done ?? 0) + 1} of ${run.total}) — 2–5 min a page. You can leave this page; it keeps running.`;
    }
    if (run.state === "failed") return `Auto-trace stopped: ${run.error ?? "unknown error"}`;
    const failed = (run.pages ?? []).filter((p) => p.status === "failed");
    const noArt = (run.pages ?? []).filter((p) => p.status === "no base art");
    return (
      `Traced ${run.traced ?? 0} page${run.traced === 1 ? "" : "s"}` +
      (failed.length
        ? ` · ${failed.length} failed (p${failed[0].pageNumber}: ${failed[0].detail ?? "unknown"})`
        : "") +
      (noArt.length && !run.traced && !failed.length
        ? " · this page has no saved base art yet — save the page first"
        : "")
    );
  }

  async function followRun() {
    setAutoTracing(true);
    try {
      for (;;) {
        const run = await adminApi.autoTraceStatus(slug, variant);
        if (run.state === "idle") break;
        setAutoTraceMsg(describeRun(run));
        if (run.state !== "running") {
          // Re-read: the outlines now live on the server, not in local state.
          setPages(await adminApi.pages(slug, variant));
          break;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (e) {
      setAutoTraceMsg(e instanceof Error ? e.message : "Auto-trace failed");
    } finally {
      setAutoTracing(false);
    }
  }

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    adminApi
      .autoTraceStatus(slug, variant)
      .then((run) => {
        if (!cancelled && run.state === "running") followRun();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, variant]);

  async function autoTrace(scope: "page" | "book") {
    if (autoTracing || !page) return;
    const pages = scope === "page" ? [page.pageNumber] : undefined;
    const cost = scope === "page" ? "~$0.40" : "~$0.40 per page";
    if (
      !confirm(
        scope === "page"
          ? `Trace this page's face with SAM3?

Takes 2-5 minutes and costs ${cost} in Segmind credits.`
          : `Trace every untraced page in this ${variant} book?

Each page takes 2-5 minutes and costs ${cost}. Pages that already have an outline are skipped.`,
      )
    )
      return;

    setAutoTraceMsg("Starting SAM3…");
    try {
      await adminApi.autoTraceFaces(slug, {
        variant,
        pageNumbers: pages,
        overwrite: scope === "page",
      });
    } catch (e) {
      setAutoTraceMsg(e instanceof Error ? e.message : "Auto-trace failed");
      return;
    }
    await followRun();
  }
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
  // Age range lives on the book, not the page, but this is where the admin is
  // working — so it is editable here as well as in the Story Library.
  const [ageLo, setAgeLo] = useState(2);
  const [ageHi, setAgeHi] = useState(8);
  const [ageBusy, setAgeBusy] = useState(false);
  useEffect(() => {
    if (story) {
      setAgeLo(story.minAge ?? 2);
      setAgeHi(story.maxAge ?? 8);
    }
  }, [story?.slug, story?.minAge, story?.maxAge]); // eslint-disable-line react-hooks/exhaustive-deps

  const ageDirty =
    !!story && (ageLo !== (story.minAge ?? 2) || ageHi !== (story.maxAge ?? 8));

  async function saveAges() {
    if (!slug) return;
    setAgeBusy(true);
    try {
      const updated = await adminApi.setAges(slug, ageLo, ageHi);
      setStories((prev) =>
        prev.map((x) => (x.slug === slug ? { ...x, ...updated } : x)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save the age range");
    } finally {
      setAgeBusy(false);
    }
  }

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

  // Admin-supplied fonts live on the shared storage volume, so the worker that
  // burns the text can load them and a rebuild doesn't wipe them.
  async function installFont(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFontBusy(true);
    try {
      const r = await adminApi.uploadFont(file);
      setFonts(r.families);
      patch("fontFamily", r.key); // select what was just installed
    } catch (err) {
      alert(err instanceof Error ? err.message : "Font upload failed");
    } finally {
      setFontBusy(false);
    }
  }

  async function removeFont(key: string) {
    if (!confirm("Remove this font? Pages using it fall back to the default sans."))
      return;
    try {
      const r = await adminApi.deleteFont(key);
      setFonts(r.families);
      if (page?.fontFamily === key) patch("fontFamily", "sans");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not remove that font");
    }
  }

  async function uploadBaseArt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again
    if (!file || !page) return;
    setUploading(true);
    try {
      const { url } = await adminApi.upload(file);
      const next = { ...page, baseImageUrl: url };
      setPages((prev) => prev.map((p, i) => (i === active ? next : p)));
      // Persist straight away. The file is already on the server at this point,
      // and leaving it only in React state meant switching page or Boy/Girl tab
      // before "Save page" silently threw the upload away.
      const saved = await adminApi.upsertPage(slug, next, variant);
      setPages((prev) => prev.map((p, i) => (i === active ? saved : p)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
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
      setDirty(false);
      return saved;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Guard the three switches that reload `pages` from the server, so unsaved
  // edits can't vanish without the admin being told.
  function leaveUnsaved(): boolean {
    return (
      !dirty ||
      confirm("This page has unsaved changes. Leave without saving them?")
    );
  }
  function goToPage(i: number) {
    if (!leaveUnsaved()) return;
    setActive(i);
    setDirty(false);
  }
  function switchVariant(v: Variant) {
    if (v === variant || !leaveUnsaved()) return;
    setVariant(v);
  }
  function switchStory(s: string) {
    if (s === slug || !leaveUnsaved()) return;
    setSlug(s);
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
  const hasSpine = pages.some((p) => p.pageNumber === SPINE);

  function addPage() {
    const storyNums = pages
      .filter((p) => p.pageNumber >= 1)
      .map((p) => p.pageNumber);
    const next = (storyNums.length ? Math.max(...storyNums) : 0) + 1;
    // Keep reading order: story pages sit before the back cover and the spine.
    const trailing = (hasBack ? 1 : 0) + (hasSpine ? 1 : 0);
    const at = pages.length - trailing;
    setPages((prev) => [...prev.slice(0, at), BLANK(next), ...prev.slice(at)]);
    setActive(at);
  }

  function addCover(n: number) {
    if (n === FRONT_COVER) {
      setPages((prev) => [BLANK_COVER(n), ...prev]);
      setActive(0);
      return;
    }
    // Back cover goes before the spine, which always sorts last.
    const at = n === BACK_COVER && hasSpine ? pages.length - 1 : pages.length;
    setPages((prev) => [...prev.slice(0, at), BLANK_COVER(n), ...prev.slice(at)]);
    setActive(at);
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
        `Have AI WRITE NEW TEXT for ${numPages} pages?

` +
          `This REPLACES the ${variant} page text you have already authored. ` +
          `It does not render anything — to see the book as a customer would, ` +
          `use Previews → Test render a book.`,
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
          {/* The two are easy to confuse: this one RENDERS what is authored,
              the AI button REPLACES what is authored. */}
          <Link
            href="/admin/previews"
            title="See this book rendered exactly as a customer would get it"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-brand-primary px-4 py-2 text-sm font-bold text-brand-primary hover:bg-brand-primary/5"
          >
            <Sparkles className="h-4 w-4" /> Test render a book
          </Link>
          <button
            onClick={generateStory}
            disabled={authoring || !slug}
            title="Write NEW narrative text for this book with AI — replaces the pages you have authored"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {authoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            Write story text (AI) — {variant}
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
            onChange={(e) => switchStory(e.target.value)}
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

        <span className="mx-1 hidden h-7 w-px bg-brand-borderAccent sm:block" />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-deep">Ages</span>
          <input
            type="number"
            min={0}
            max={18}
            value={ageLo}
            onChange={(e) => setAgeLo(Number(e.target.value))}
            className="w-16 rounded-lg border-2 border-brand-borderAccent px-2 py-1 text-sm outline-none focus:border-brand-primary"
          />
          <span className="text-xs text-slate-mutedText">to</span>
          <input
            type="number"
            min={0}
            max={18}
            value={ageHi}
            onChange={(e) => setAgeHi(Number(e.target.value))}
            className="w-16 rounded-lg border-2 border-brand-borderAccent px-2 py-1 text-sm outline-none focus:border-brand-primary"
          />
          <button
            onClick={saveAges}
            disabled={ageBusy || !ageDirty}
            className="rounded-lg bg-brand-primary px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            {ageBusy ? "Saving…" : ageDirty ? "Save ages" : "Saved"}
          </button>
          <span className="text-xs text-slate-mutedText">
            shown on the storefront as “{`Ages ${Math.min(ageLo, ageHi)}-${Math.max(ageLo, ageHi)}`}”
          </span>
        </div>
      </div>

      {/* Which gender's artwork is being authored */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl border-2 border-brand-primary">
          {VARIANTS.map((v) => (
            <button
              key={v}
              onClick={() => switchVariant(v)}
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
            onClick={() => goToPage(i)}
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
        {!hasSpine && (
          <button
            onClick={() => addCover(SPINE)}
            title="Add the spine artwork — print only, never shown to the customer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 px-3 text-xs font-bold text-slate-mutedText hover:border-brand-primary hover:text-brand-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Spine
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
                  {page.pageNumber === FRONT_COVER
                    ? "Front cover"
                    : page.pageNumber === SPINE
                      ? "Spine (print only)"
                      : "Back cover"}
                </p>
                <p className="mt-0.5 text-xs text-slate-mutedText">
                  {page.pageNumber === SPINE ? (
                    <>
                      The strip between the covers on the printed wrap. It is
                      <b> not a page of the book</b> — it never appears in the
                      preview, the page count, or the interior PDF. Upload the
                      spine artwork and set its text; usually the title, no face.
                    </>
                  ) : (
                    <>
                      A real page in the book: the child&apos;s face is swapped
                      into the base art below and the text is burned in, exactly
                      like a story page.{" "}
                      {page.pageNumber === FRONT_COVER
                        ? "It reads first and is part of the free preview."
                        : "It reads last and unlocks after purchase."}
                    </>
                  )}
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

              {/* Auto-trace. Worth the wait and the credits because an outline
                  is authored once and then every render of every customer's
                  book uses it. */}
              <div className="mt-3 rounded-xl border-2 border-dashed border-brand-borderAccent p-3">
                <p className="text-xs text-slate-mutedText">
                  Or let <b>SAM3</b> trace it: it follows the real hairline and
                  jaw. Takes <b>2–5 minutes</b> and costs <b>~$0.40</b> a page in
                  Segmind credits, so it runs once per plate and is saved like a
                  hand-traced outline.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => autoTrace("page")}
                    disabled={autoTracing || !page.baseImageUrl}
                    className="rounded-xl border-2 border-brand-primary px-3 py-1.5 text-xs font-bold text-brand-primary transition hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {autoTracing ? "Tracing…" : "Auto-trace this page"}
                  </button>
                  <button
                    onClick={() => autoTrace("book")}
                    disabled={autoTracing}
                    className="rounded-xl border-2 border-brand-borderAccent px-3 py-1.5 text-xs font-bold text-slate-mutedText transition hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Trace all untraced pages
                  </button>
                </div>
                {autoTraceMsg && (
                  <p className="mt-2 text-xs font-semibold text-slate-deep">
                    {autoTraceMsg}
                  </p>
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
            {/* Text rows — each with its own font, size, colour and warp */}
            <div>
              <span className="mb-1 block text-sm font-semibold text-slate-deep">
                Text rows (use {"{{name}}"} for the child&apos;s name)
              </span>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {blocks.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => setRow(i)}
                    title={b.text?.trim() || `Row ${i + 1}`}
                    className={`inline-flex max-w-[11rem] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      i === row
                        ? "bg-brand-primary text-white"
                        : "border-2 border-brand-borderAccent text-slate-mutedText hover:border-brand-primary"
                    }`}
                  >
                    {/* The row's colour goes in a swatch, not the label: tinting
                        the text made a white row invisible on a white tab. */}
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-slate-300"
                      style={{ backgroundColor: b.fontColor || "#FFFFFF" }}
                    />
                    <span className="truncate">
                      {b.text?.trim() || `Row ${i + 1}`}
                    </span>
                  </button>
                ))}
                <button
                  onClick={addRow}
                  title="Add another styled row"
                  className="rounded-lg border-2 border-dashed border-brand-primary px-2.5 py-1 text-xs font-bold text-brand-primary"
                >
                  + Row
                </button>
                {blocks.length > 1 && (
                  <button
                    onClick={() => removeRow(row)}
                    className="rounded-lg border-2 border-red-200 px-2.5 py-1 text-xs font-bold text-red-500"
                  >
                    Delete row
                  </button>
                )}
              </div>
              <input
                value={block.text}
                onChange={(e) => patchBlock("text", e.target.value)}
                placeholder="{{name}} climbed up to the treehouse."
                className="input"
              />
              <p className="mt-1 text-xs text-slate-mutedText">
                Everything below styles the <b>selected row</b> only — so a cover
                can stack rows in different fonts, sizes and colours.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Text X (%)">
                <input
                  type="number"
                  step="0.5"
                  value={block.textX}
                  onChange={(e) => patchBlock("textX", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Text Y (%)">
                <input
                  type="number"
                  step="0.5"
                  value={block.textY}
                  onChange={(e) => patchBlock("textY", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Font size (px @1024)">
                <input
                  type="number"
                  value={block.fontSize}
                  onChange={(e) => patchBlock("fontSize", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Font color">
                <input
                  type="color"
                  value={block.fontColor}
                  onChange={(e) => patchBlock("fontColor", e.target.value)}
                  className="h-10 w-full rounded-xl border-2 border-brand-borderAccent"
                />
              </Field>
              <Field label="Font">
                <select
                  value={block.fontFamily || "sans"}
                  onChange={(e) => patchBlock("fontFamily", e.target.value)}
                  className="input"
                >
                  {fonts.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                      {f.custom ? " (yours)" : ""}
                      {f.installed ? "" : " (not installed — falls back)"}
                    </option>
                  ))}
                </select>
                <div className="mt-1.5 flex items-center gap-3">
                  <input
                    ref={fontRef}
                    type="file"
                    accept=".ttf,.otf,.ttc"
                    onChange={installFont}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fontRef.current?.click()}
                    disabled={fontBusy}
                    className="text-xs font-bold text-brand-primary hover:underline disabled:opacity-50"
                  >
                    {fontBusy ? "Installing…" : "+ Add your own font"}
                  </button>
                  {fonts.find((f) => f.key === page.fontFamily)?.custom && (
                    <button
                      type="button"
                      onClick={() => removeFont(page.fontFamily)}
                      className="text-xs font-semibold text-red-500 hover:underline"
                    >
                      Remove this font
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Letter spacing (px @1024)">
                <input
                  type="number"
                  step="0.5"
                  value={block.letterSpacing ?? 0}
                  onChange={(e) => patchBlock("letterSpacing", Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Stroke colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={block.outlineColor || "#FFFFFF"}
                    onChange={(e) => patchBlock("outlineColor", e.target.value)}
                    className="h-10 w-14 rounded-xl border-2 border-brand-borderAccent"
                  />
                  <button
                    type="button"
                    onClick={() => patchBlock("outlineColor", "")}
                    className={`rounded-lg border-2 px-2 py-1 text-xs font-bold ${
                      block.outlineColor
                        ? "border-brand-borderAccent text-slate-mutedText"
                        : "border-brand-primary text-brand-primary"
                    }`}
                  >
                    Auto
                  </button>
                  <label className="ml-1 flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={block.shadow !== false}
                      onChange={(e) => patchBlock("shadow", e.target.checked)}
                      className="h-4 w-4 accent-brand-primary"
                    />
                    <span className="text-xs font-semibold text-slate-deep">
                      Shadow
                    </span>
                  </label>
                </div>
              </Field>
              <Field label="Stroke / outline (px @1024 — 0 = none)">
                <input
                  type="number"
                  min="0"
                  value={block.outlineWidth ?? 3}
                  onChange={(e) =>
                    patchBlock("outlineWidth", Math.max(0, Number(e.target.value)))
                  }
                  className="input"
                />
              </Field>
            </div>
            {(block.outlineWidth ?? 3) > 0 && (
              <>
                <div className="-mt-2 grid grid-cols-2 gap-4">
                  <Field label="2nd stroke (px @1024 — 0 = off)">
                    <input
                      type="number"
                      min={0}
                      value={block.outline2Width ?? 0}
                      onChange={(e) =>
                        patchBlock(
                          "outline2Width",
                          Math.max(0, Number(e.target.value)),
                        )
                      }
                      className="input"
                    />
                  </Field>
                  <Field label="2nd stroke colour">
                    <input
                      type="color"
                      value={block.outline2Color || "#FFFFFF"}
                      onChange={(e) =>
                        patchBlock("outline2Color", e.target.value)
                      }
                      className="h-10 w-full rounded-xl border-2 border-brand-borderAccent"
                    />
                  </Field>
                </div>
                <p className="-mt-2 text-xs text-slate-mutedText">
                  A second stroke must be <b>wider</b> than the first to show —
                  it is drawn outside it, giving the layered keyline on
                  children&apos;s book covers (fill, white ring, dark ring). Over
                  a light text panel, set both strokes to <b>0</b> and use a dark
                  font colour instead.
                </p>
              </>
            )}

            <label className="flex items-start gap-3 rounded-xl border-2 border-brand-borderAccent p-3">
              <input
                type="checkbox"
                checked={softBreak}
                onChange={(e) => patchBlock("softLineBreak", e.target.checked)}
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

            {/* Panel behind the text */}
            <div className="rounded-xl border-2 border-brand-borderAccent p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={textBox.enabled}
                  onChange={(e) => patchBox("enabled", e.target.checked)}
                  className="h-4 w-4 accent-brand-primary"
                />
                <span className="text-sm font-bold text-slate-deep">
                  Background box
                </span>
                <span className="text-xs text-slate-mutedText">
                  one panel behind <b>all</b> the rows on this page
                </span>
              </label>

              {textBox.enabled && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="color"
                      value={textBox.color || "#FFFFFF"}
                      onChange={(e) => patchBox("color", e.target.value)}
                      className="h-9 w-14 rounded-xl border-2 border-brand-borderAccent"
                    />
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={textBox.fullWidth}
                        onChange={(e) =>
                          patchBox("fullWidth", e.target.checked)
                        }
                        className="h-4 w-4 accent-brand-primary"
                      />
                      <span className="text-xs font-semibold text-slate-deep">
                        Full width
                      </span>
                    </label>
                  </div>
                  <Slider
                    label="Opacity"
                    min={0}
                    value={textBox.opacity ?? 70}
                    onChange={(v) => patchBox("opacity", v)}
                  />
                  <Slider
                    label="Padding"
                    min={0}
                    value={textBox.padding ?? 26}
                    onChange={(v) => patchBox("padding", v)}
                  />
                  <Slider
                    label="Corner"
                    min={0}
                    value={textBox.radius ?? 22}
                    onChange={(v) => patchBox("radius", v)}
                  />
                </div>
              )}
            </div>

            {/* Warp — mirrors Photoshop's Warp Options dialog */}
            <div className="rounded-xl border-2 border-brand-borderAccent p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-slate-deep">Warp</span>
                <select
                  value={block.warpStyle || "none"}
                  onChange={(e) => patchBlock("warpStyle", e.target.value)}
                  className="rounded-lg border-2 border-brand-borderAccent px-2 py-1 text-sm outline-none focus:border-brand-primary"
                >
                  <option value="none">None</option>
                  <option value="arc">Arc</option>
                </select>
                {warpOn && (
                  <div className="flex items-center gap-3">
                    {([false, true] as const).map((vert) => (
                      <label key={String(vert)} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={!!block.warpVertical === vert}
                          onChange={() => patchBlock("warpVertical", vert)}
                          className="h-3.5 w-3.5 accent-brand-primary"
                        />
                        <span className="text-xs font-semibold text-slate-deep">
                          {vert ? "Vertical" : "Horizontal"}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {warpOn && (
                <div className="mt-3 space-y-2">
                  <Slider
                    label="Bend"
                    value={block.warpBend ?? 0}
                    onChange={(v) => patchBlock("warpBend", v)}
                  />
                  <p className="pt-1 text-xs font-semibold text-slate-mutedText">
                    Distortion
                  </p>
                  <Slider
                    label="Horizontal"
                    value={block.warpDistortH ?? 0}
                    onChange={(v) => patchBlock("warpDistortH", v)}
                  />
                  <Slider
                    label="Vertical"
                    value={block.warpDistortV ?? 0}
                    onChange={(v) => patchBlock("warpDistortV", v)}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {dirty ? "Save page •" : "Save page"}
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
                  src={warpUrl || page.baseImageUrl}
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
                className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center ${
                  serverPreview ? "hidden" : ""
                }`}
                style={{
                  left: `${page.textX}%`,
                  // Same width the renderer wraps to: lines are centred on
                  // textX, so the usable width is the shorter side doubled. A
                  // flat 86% here drew a box that hung off the page and made an
                  // off-centre row look contained when the burned page ran over.
                  width: `${Math.max(
                    25,
                    Math.min(86, 2 * Math.min(page.textX - 7, 93 - page.textX)),
                  )}%`,
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
                        `-${outlinePx}px -${outlinePx}px 0 ${haloColor}`,
                        `${outlinePx}px -${outlinePx}px 0 ${haloColor}`,
                        `-${outlinePx}px ${outlinePx}px 0 ${haloColor}`,
                        `${outlinePx}px ${outlinePx}px 0 ${haloColor}`,
                        `0 ${outlinePx}px ${outlinePx * 2}px ${haloColor}`,
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
            {serverPreview && (
              <p className="mt-2 text-xs font-semibold text-brand-primary">
                {warpUrl
                  ? "Composed by the real renderer — exactly what gets burned in."
                  : page.baseImageUrl
                    ? "Composing…"
                    : "Upload base art to preview this."}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              With base art set, the engine face-swaps the child onto this fixed
              illustration; otherwise it renders the scene prompt via FLUX+PuLID.
              Then PIL burns this text at ({page.textX}%, {page.textY}%).
            </p>
          </div>
        </div>
      )}

      {/* Provider A/B on this book's demo page. Admin view: vendor names,
          elapsed time and indicative per-image cost. */}
      {slug && (
        <div className="mt-8">
          <ProviderCompare
            slug={slug}
            variant={variant}
            adminToken={getToken()}
            title="Compare image providers"
            blurb="Upload a test photo to render this book's demo page through every configured provider. Same base plate, same face region — the provider is the only difference."
          />
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

// Photoshop's warp sliders: -100..100 with the numeric box beside them.
function Slider({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs font-semibold text-slate-mutedText">
        {label}:
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 accent-brand-primary"
      />
      <div className="flex w-16 shrink-0 items-center rounded-lg border-2 border-brand-borderAccent px-1.5 py-0.5">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) =>
            onChange(Math.max(min, Math.min(max, Number(e.target.value))))
          }
          className="w-full text-right text-xs outline-none"
        />
        <span className="text-xs text-slate-400">%</span>
      </div>
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
