"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { adminApi, type AdminStory, type StoryCreate } from "@/lib/admin";
import { inr } from "@/lib/format";

const CATEGORIES = ["LEARNING", "IMAGINATION", "ADVENTURE", "BEDTIME"] as const;

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The label shown on the storefront is DERIVED from min/max — it used to be a
// prefilled string with no input, so it stayed "Ages 3-7" no matter what the
// admin typed.
function ageLabel(minAge: number, maxAge: number): string {
  return `Ages ${minAge}-${maxAge}`;
}

const BLANK_BOOK: StoryCreate = {
  slug: "",
  title: "",
  tagline: "",
  description: "",
  categoryTag: "ADVENTURE",
  ageRange: ageLabel(3, 7),
  minAge: 3,
  maxAge: 7,
  pdfPrice: 799,
  printPrice: 1399,
  pages: 28,
  coverImage: "",
  supportsTamil: true,
};

export default function AdminStories() {
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function replaceStory(updated: AdminStory) {
    setStories((prev) =>
      prev.map((x) => (x.slug === updated.slug ? { ...x, ...updated } : x)),
    );
  }

  useEffect(() => {
    adminApi
      .stories()
      .then(setStories)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle(story: AdminStory) {
    setBusy(story.slug);
    try {
      const updated = await adminApi.toggleStory(story.slug, !story.active);
      setStories((prev) =>
        prev.map((s) => (s.slug === story.slug ? { ...s, active: updated.active } : s)),
      );
    } catch {
      alert("Failed to update story");
    } finally {
      setBusy(null);
    }
  }

  async function remove(story: AdminStory) {
    if (
      !confirm(
        `Delete "${story.title}" permanently? This removes the book, its authored ` +
          `pages, and any free (non-purchased) preview sessions. Books with real ` +
          `orders can't be deleted. This cannot be undone.`,
      )
    )
      return;
    setBusy(story.slug);
    try {
      await adminApi.deleteStory(story.slug);
      setStories((prev) => prev.filter((s) => s.slug !== story.slug));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete story";
      // Blocked because the book has orders — offer an explicit force delete.
      if (/order/i.test(msg)) {
        if (
          confirm(
            `${msg}\n\nForce delete "${story.title}"? The book, its pages and ` +
              `preview sessions are removed. Order records are kept (just unlinked).`,
          )
        ) {
          try {
            await adminApi.deleteStory(story.slug, true);
            setStories((prev) => prev.filter((s) => s.slug !== story.slug));
          } catch (e2) {
            alert(e2 instanceof Error ? e2.message : "Force delete failed");
          }
        }
      } else {
        alert(msg);
      }
    } finally {
      setBusy(null);
    }
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-deep">Story Library (CMS)</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-mutedText">
            {stories.filter((s) => s.active).length}/{stories.length} live
          </span>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> New book
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((s) => (
          <div key={s.id} className="card overflow-hidden">
            <div className="relative aspect-[4/3] w-full bg-slate-50">
              <Image
                src={s.coverImage}
                alt={s.title}
                fill
                sizes="320px"
                className={`object-cover ${s.active ? "" : "grayscale"}`}
              />
              <span className="absolute left-3 top-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-bold uppercase text-white">
                {s.categoryTag}
              </span>
            </div>
            <div className="p-4">
              <h3 className="font-bold text-slate-deep">{s.title}</h3>
              <p className="text-sm text-slate-mutedText">
                {s.ageRange} · {inr(s.pdfPrice)} / {inr(s.printPrice)}
              </p>
              <AgeEditor story={s} onSaved={(u) => replaceStory(u)} />
              <div className="mt-3 flex items-center justify-between gap-2">
                <span
                  className={`text-xs font-bold ${
                    s.active ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {s.active ? "● Live" : "○ Hidden"}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/pages?slug=${s.slug}`}
                    className="rounded-lg border-2 border-brand-borderAccent px-3 py-1.5 text-xs font-bold text-slate-deep transition hover:border-brand-primary"
                  >
                    Author pages
                  </Link>
                  <button
                    onClick={() => toggle(s)}
                    disabled={busy === s.slug}
                    className="rounded-lg border-2 border-brand-primary px-3 py-1.5 text-xs font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white disabled:opacity-50"
                  >
                    {busy === s.slug ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : s.active ? (
                      "Hide"
                    ) : (
                      "Publish"
                    )}
                  </button>
                  <button
                    onClick={() => remove(s)}
                    disabled={busy === s.slug}
                    title="Delete book permanently"
                    aria-label={`Delete ${s.title}`}
                    className="rounded-lg border-2 border-red-200 p-1.5 text-red-500 transition hover:border-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateBookModal
          onClose={() => setShowCreate(false)}
          onCreated={(story) => {
            setStories((prev) => [...prev, story]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

// Age is what the storefront shows, and it was stuck at whatever the create
// form sent. Editable here so books created before the fix can be corrected —
// there is no other story-edit screen.
function AgeEditor({
  story,
  onSaved,
}: {
  story: AdminStory;
  onSaved: (s: AdminStory) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lo, setLo] = useState(story.minAge ?? 2);
  const [hi, setHi] = useState(story.maxAge ?? 8);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      onSaved(await adminApi.setAges(story.slug, lo, hi));
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save the age range");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 text-xs font-semibold text-brand-primary hover:underline"
      >
        Edit age range
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={18}
        value={lo}
        onChange={(e) => setLo(Number(e.target.value))}
        className="w-14 rounded-lg border-2 border-brand-borderAccent px-2 py-1 text-xs"
      />
      <span className="text-xs text-slate-mutedText">to</span>
      <input
        type="number"
        min={0}
        max={18}
        value={hi}
        onChange={(e) => setHi(Number(e.target.value))}
        className="w-14 rounded-lg border-2 border-brand-borderAccent px-2 py-1 text-xs"
      />
      <button
        onClick={save}
        disabled={busy}
        className="rounded-lg bg-brand-primary px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? "…" : "Save"}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-xs font-semibold text-slate-mutedText hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}

function CreateBookModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (s: AdminStory) => void;
}) {
  const [form, setForm] = useState<StoryCreate>(BLANK_BOOK);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof StoryCreate>(k: K, v: StoryCreate[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError(null);
    const slug = form.slug || slugify(form.title);
    if (!form.title.trim() || !slug) {
      setError("Title is required");
      return;
    }
    const body: StoryCreate = {
      ...form,
      slug,
      ageRange: ageLabel(form.minAge, form.maxAge),
      // Placeholder until the book's Front cover is authored — saving that page
      // overwrites this with its base art.
      coverImage: "/covers/journey-to-the-stars.svg",
      tagline: form.tagline || form.title,
      description: form.description || form.tagline || form.title,
    };
    setSaving(true);
    try {
      const created = await adminApi.createStory(body);
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl md:p-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-deep">Create a book</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-deep">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input
              className="ainput"
              value={form.title}
              onChange={(e) => {
                set("title", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
              placeholder="The Great Space Rescue"
            />
          </Field>
          <Field label="Slug (URL id)">
            <input
              className="ainput"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", slugify(e.target.value));
              }}
              placeholder="the-great-space-rescue"
            />
          </Field>
          <Field label="Category">
            <select
              className="ainput"
              value={form.categoryTag}
              onChange={(e) => set("categoryTag", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Min age">
            <input
              type="number"
              className="ainput"
              value={form.minAge}
              onChange={(e) => set("minAge", Number(e.target.value))}
            />
          </Field>
          <Field label="Max age">
            <input
              type="number"
              className="ainput"
              value={form.maxAge}
              onChange={(e) => set("maxAge", Number(e.target.value))}
            />
          </Field>
          <Field label="PDF price (₹)">
            <input
              type="number"
              className="ainput"
              value={form.pdfPrice}
              onChange={(e) => set("pdfPrice", Number(e.target.value))}
            />
          </Field>
          <Field label="Print price (₹)">
            <input
              type="number"
              className="ainput"
              value={form.printPrice}
              onChange={(e) => set("printPrice", Number(e.target.value))}
            />
          </Field>
          <Field label="Total pages">
            <input
              type="number"
              className="ainput"
              value={form.pages}
              onChange={(e) => set("pages", Number(e.target.value))}
            />
          </Field>
          <Field label="Tagline" className="sm:col-span-2">
            <input
              className="ainput"
              value={form.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="Blast off on a cosmic mission across the galaxy."
            />
          </Field>
          <Field label="Cover" className="sm:col-span-2">
            <p className="rounded-xl border-2 border-dashed border-brand-borderAccent bg-slate-50 p-3 text-xs text-slate-mutedText">
              Nothing to upload here. A book&apos;s cover is the{" "}
              <b>Front cover</b> page you author next — its base art is what the
              storefront card, cart and checkout show. A placeholder stands in
              until then.
            </p>
          </Field>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border-2 border-brand-borderAccent px-4 py-2 text-sm font-bold text-slate-deep"
          >
            Cancel
          </button>
          <button onClick={submit} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & author pages"}
          </button>
        </div>

        <style jsx>{`
          :global(.ainput) {
            width: 100%;
            border-radius: 0.75rem;
            border: 2px solid #ebd9f7;
            padding: 0.55rem 0.8rem;
            font-size: 0.9rem;
            outline: none;
            background: #fff;
          }
          :global(.ainput:focus) {
            border-color: #9333ea;
          }
        `}</style>
      </div>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-semibold text-slate-deep">{label}</span>
      {children}
    </label>
  );
}
