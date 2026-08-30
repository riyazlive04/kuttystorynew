import { Camera, Sparkles, BookOpen, Star } from "lucide-react";
import { HOW_TO_STEPS } from "@/lib/howto";

// Icons live here rather than in lib/howto.ts so the shared step text stays a
// plain data module that the JSON-LD builder can import without pulling React in.
const STEP_ICONS = [Camera, Sparkles, BookOpen];

export function Steps() {
  return (
    <section id="how" className="container-x py-16">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-bold text-slate-deep md:text-4xl">
          How to make a personalised story book, in three steps
        </h2>
        <p className="mt-3 text-slate-mutedText">
          From photo to finished story in about a minute - free until you decide.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {HOW_TO_STEPS.map((s, i) => {
          const Icon = STEP_ICONS[i] ?? Sparkles;
          return (
            <div key={s.name} className="card p-8 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                <Icon className="h-7 w-7" />
              </span>
              <h3 className="mt-5 text-lg font-bold text-slate-deep">
                {i + 1}. {s.name}
              </h3>
              <p className="mt-2 text-sm text-slate-mutedText">{s.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Reviews() {
  const reviews = [
    {
      name: "Priya S.",
      city: "Chennai",
      text: "My daughter's face lit up when she saw herself in the story! She looks just like the girl on every page. Print quality is gorgeous.",
    },
    {
      name: "Karthik R.",
      city: "Bengaluru",
      text: "Ordered as a birthday gift. The free preview sold me instantly - you can see exactly what you're getting before paying.",
    },
    {
      name: "Anitha M.",
      city: "Coimbatore",
      text: "The hardcover feels premium and arrived beautifully packed. My son asks to read 'his' book every single night now.",
    },
  ];
  return (
    <section id="reviews" className="bg-white py-16">
      <div className="container-x">
        <div className="mb-12 text-center">
          <div className="mb-2 flex justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <h2 className="text-3xl font-bold text-slate-deep md:text-4xl">
            Loved by families across India
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {reviews.map((r) => (
            <figure key={r.name} className="card p-7">
              <div className="mb-3 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>
              <blockquote className="text-sm leading-relaxed text-slate-700">
                &ldquo;{r.text}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-sm font-bold text-slate-deep">
                {r.name}{" "}
                <span className="font-normal text-slate-400">· {r.city}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
