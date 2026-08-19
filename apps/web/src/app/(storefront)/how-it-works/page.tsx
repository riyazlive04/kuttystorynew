import type { Metadata } from "next";
import Link from "next/link";
import { Steps } from "@/components/Marketing";
import { Faq } from "@/components/Faq";
import { ArrowRight, Truck, Palette, ShieldCheck, Globe2 } from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works - Personalized Storybooks in Minutes | KuttyStory",
  description:
    "See how KuttyStory turns your child's photo and name into a beautiful personalized storybook in minutes - free preview, then instant PDF or a printed hardcover delivered across India.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  const perks = [
    {
      icon: Palette,
      title: "Studio-quality art",
      body: "Every page is a hand-crafted illustration, not a cheap filter.",
    },
    {
      icon: Globe2,
      title: "English & Tamil",
      body: "Read in the language your family loves - or both, side by side.",
    },
    {
      icon: Truck,
      title: "Free India delivery",
      body: "Premium hardcovers shipped to your door at no extra cost.",
    },
    {
      icon: ShieldCheck,
      title: "Preview before you pay",
      body: "You approve the full story first. Zero surprises, ever.",
    },
  ];

  return (
    <div>
      <section className="container-x py-14 text-center">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          How KuttyStory works
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-mutedText">
          We combine professional children&apos;s illustration with smart
          personalization so your child becomes the star - beautifully, and in
          minutes.
        </p>
      </section>

      <Steps />

      <section className="container-x py-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((p) => (
            <div key={p.title} className="card p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                <p.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-bold text-slate-deep">{p.title}</h3>
              <p className="mt-1.5 text-sm text-slate-mutedText">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Faq />

      <section className="container-x pb-20 text-center">
        <Link href="/stories" className="btn-primary inline-flex text-base">
          Start your free preview <ArrowRight className="h-5 w-5" />
        </Link>
      </section>
    </div>
  );
}
