"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Loader2,
  Lock,
  Sparkles,
  Upload,
} from "lucide-react";
import type { Personalization, Story } from "@/lib/types";
import { createJob, uploadPhoto } from "@/lib/api";
import { languageLabel, previewPath } from "@/lib/format";

const STEPS = ["Child", "Photo", "Review"] as const;

export function PersonalizeWizard({ story }: { story: Story }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState(false);

  const [data, setData] = useState<Personalization>({
    storySlug: story.slug,
    childName: "",
    gender: "boy",
    ageYears: 4,
    language: "en",
    skinTone: "medium",
  });

  function update<K extends keyof Personalization>(
    key: K,
    value: Personalization[K],
  ) {
    setData((d) => ({ ...d, [key]: value }));
  }

  const [uploadingCount, setUploadingCount] = useState(0);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, 3); // a few photos
    if (!files.length) return;
    // Preview the first photo immediately.
    const reader = new FileReader();
    reader.onload = () => update("photoDataUrl", reader.result as string);
    reader.readAsDataURL(files[0]);
    // Upload all; the first is primary, the rest strengthen identity.
    setUploadingCount(files.length);
    Promise.all(files.map((f) => uploadPhoto(f).catch(() => undefined)))
      .then((urls) => {
        const ok = urls.filter((u): u is string => Boolean(u));
        if (ok.length) {
          update("photoUrl", ok[0]);
          update("photoUrls", ok);
        }
      })
      .finally(() => setUploadingCount(0));
  }

  // Nav (Back/Continue) only shows on Child(0) & Photo(1); Review(2) has its own
  // generate button. Continuing from Child needs a valid name; Photo is optional.
  const canNext =
    (step === 0 && data.childName.trim().length >= 2) || step === 1;

  // Direct step navigation via the stepper. Back is always free; jumping forward
  // only needs the child's name (the sole hard requirement, on step 0).
  const nameReady = data.childName.trim().length >= 2;
  function goToStep(target: number) {
    if (submitting || target === step) return;
    if (target < step || nameReady) setStep(target);
  }

  async function handleCreate() {
    setSubmitting(true);
    try {
      const job = await createJob(data);
      router.push(previewPath(job.id, job.childName, job.storyTitle));
    } catch (e) {
      setSubmitting(false);
      alert("Something went wrong creating your preview. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Stepper */}
      <ol className="mb-8 flex items-center justify-between">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          const reachable = i < step || nameReady;
          return (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => goToStep(i)}
                disabled={submitting || (i > step && !nameReady)}
                aria-current={active ? "step" : undefined}
                aria-label={`Go to ${label} step`}
                className={`flex flex-col items-center rounded-lg px-1 py-0.5 transition ${
                  reachable && !submitting
                    ? "cursor-pointer hover:opacity-80"
                    : "cursor-not-allowed"
                }`}
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full border-2 text-sm font-bold transition ${
                    done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : active
                        ? "border-brand-primary bg-brand-primary text-white"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={`mt-1.5 text-xs font-semibold ${
                    active ? "text-slate-deep" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  className={`mx-2 h-0.5 flex-1 rounded ${
                    i < step ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="card p-6 md:p-8">
        {/* Step 0: Child */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-slate-deep">
              Who is this story for?
            </h2>
            <Field label="Child's name">
              <input
                autoFocus
                value={data.childName}
                onChange={(e) => update("childName", e.target.value)}
                placeholder="e.g. Aarav"
                className="input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Age">
                <select
                  value={data.ageYears}
                  onChange={(e) => update("ageYears", Number(e.target.value))}
                  className="input"
                >
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((a) => (
                    <option key={a} value={a}>
                      {a} year{a > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Character">
                <div className="grid grid-cols-2 gap-2">
                  {(["boy", "girl"] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => update("gender", g)}
                      className={`rounded-xl border-2 py-2.5 text-sm font-semibold capitalize transition ${
                        data.gender === g
                          ? "border-brand-primary bg-brand-primary/5 text-brand-primaryDark"
                          : "border-slate-200 text-slate-mutedText hover:border-slate-300"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* Step 1: Photo */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-slate-deep">
              Add a few photos of {data.childName || "your child"}
            </h2>
            <p className="text-sm text-slate-mutedText">
              1–3 clear, front-facing photos work best — more angles give a
              stronger likeness on every page.{" "}
              {data.photoUrls && data.photoUrls.length > 1 && (
                <span className="font-semibold text-emerald-600">
                  {data.photoUrls.length} photos added ✓
                </span>
              )}
            </p>
            {/* Gallery / file picker (mobile also offers camera here) */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFile}
              className="hidden"
            />
            {/* Direct camera capture on mobile (rear camera). */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="group relative grid h-64 w-full place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-brand-primary"
            >
              {data.photoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.photoDataUrl}
                  alt="Uploaded child"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm">
                    <Camera className="h-6 w-6 text-brand-primary" />
                  </span>
                  <span className="font-semibold text-slate-deep">
                    Tap to upload or take a photo
                  </span>
                  <span className="text-xs">PNG or JPG, up to 10MB</span>
                </div>
              )}
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-brand-primary px-4 py-2 text-sm font-bold text-brand-primary transition hover:bg-brand-primary/5"
              >
                <Camera className="h-4 w-4" /> Take a photo
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-brand-borderAccent px-4 py-2 text-sm font-bold text-slate-deep transition hover:border-brand-primary hover:text-brand-primary"
              >
                <Upload className="h-4 w-4" />{" "}
                {data.photoDataUrl ? "Replace / upload" : "Upload from gallery"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-slate-deep">
              Ready to see the magic?
            </h2>
            <div className="flex gap-4 rounded-2xl bg-brand-cream p-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={story.coverImage}
                  alt={story.title}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
              <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Summary k="Story" v={story.title} />
                <Summary k="Hero" v={data.childName || "-"} />
                <Summary k="Age" v={`${data.ageYears} yrs`} />
                <Summary k="Language" v={languageLabel(data.language)} />
                <Summary
                  k="Photo"
                  v={data.photoDataUrl ? "Uploaded ✓" : "Skipped"}
                />
                <Summary k="Pages" v={`${story.pages}`} />
              </dl>
            </div>
            <p className="text-sm text-slate-mutedText">
              We&apos;ll generate your free preview instantly. You only pay when
              you love it.
            </p>

            {/* Parental-consent gate (required before generating) */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-mutedText">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-primary"
              />
              <span>
                I confirm that I am at least 18 years old and have obtained
                consent from the child&apos;s parent or guardian to share this
                information for the purpose of creating a personalized storybook,
                in accordance with the{" "}
                <Link
                  href="/#"
                  className="font-semibold text-brand-primary underline"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            <button
              onClick={handleCreate}
              disabled={submitting || !consent}
              title={!consent ? "Please confirm consent to continue" : undefined}
              className="btn-primary w-full text-base disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Creating your
                  preview…
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" /> Generate Free Preview
                </>
              )}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-mutedText">
              <Lock className="h-3.5 w-3.5" /> Your data is protected
            </p>
          </div>
        )}

        {/* Nav */}
        {step < 2 && (
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-mutedText disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={() => canNext && setStep((s) => s + 1)}
              disabled={!canNext}
              className="btn-primary !py-3 disabled:opacity-50"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.85rem;
          border: 2px solid #e2e8f0;
          padding: 0.7rem 0.9rem;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.15s;
          background: #fff;
        }
        :global(.input:focus) {
          border-color: #ff6f61;
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
      <span className="mb-1.5 block text-sm font-semibold text-slate-deep">
        {label}
      </span>
      {children}
    </label>
  );
}

function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
      <dd className="font-semibold text-slate-deep">{v}</dd>
    </div>
  );
}
