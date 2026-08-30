import Link from "next/link";
import { FACTS } from "@/lib/seo";
import { inr } from "@/lib/format";
import { KeyFacts, Prose, ProseH2, ProseH3 } from "./Prose";

/**
 * The home page's indexable body copy.
 *
 * Every competitor that outranks us for "personalised story books for kids in
 * India" - Zingy Gifts, Bookyboo, Imagitime - carries 1,500+ words of real
 * prose on the page that sells the product, while our home page carried about
 * 120. Hero headlines and card labels are not enough text for a search engine
 * to judge topical relevance, and give an answer engine nothing to quote.
 *
 * The copy is written to be true first and keyword-bearing second: the head
 * terms ("personalised story book", "custom children's book with photo",
 * "birthday return gift") appear because they describe what is actually sold,
 * in the sentences a parent would use.
 */
export function HomeSeoContent({
  fromPdf,
  fromPrint,
}: {
  fromPdf: number;
  fromPrint: number;
}) {
  return (
    <section className="bg-white py-16">
      <div className="container-x">
        <Prose>
          <h2
            className="text-3xl font-bold text-slate-deep md:text-4xl"
            data-speakable
          >
            Personalised story books for kids, made in India
          </h2>
          <p data-speakable>
            KuttyStory makes custom children&apos;s books in which your own child
            is the hero. You upload one photo, type their first name and pick a
            story; we write them into the text and illustrate their face into
            every page. The finished book arrives as an instant PDF from{" "}
            {inr(fromPdf)} or a premium printed hardcover from {inr(fromPrint)},
            delivered free anywhere in India.
          </p>
          <p>
            Every book is a full 24-28 page picture book, not a name swapped into
            a template. And you never buy blind: the front cover and the first{" "}
            {FACTS.freePreviewPages} pages are free to preview before you decide,
            with no signup and no payment details.
          </p>

          <ProseH2>What makes a KuttyStory book different</ProseH2>

          <ProseH3>Their actual face, on every page</ProseH3>
          <p>
            Most &ldquo;personalised&rdquo; children&apos;s books stop at the
            name. Ours illustrates your child&apos;s likeness into the artwork -
            their face, skin tone and character look - so a three-year-old
            recognises themselves rather than a stock cartoon. If the first
            preview does not look like them, upload a different photo and
            regenerate it, free, as many times as you need.
          </p>

          <ProseH3>A story worth reading twice</ProseH3>
          <p>
            The text is professionally written for reading aloud: rhythm, repeat
            lines your child can join in on, and an ending that lands. Titles run
            from alphabet and counting books for toddlers to space and jungle
            adventures for early readers, plus a calm bedtime story that finishes
            with your child fast asleep.
          </p>

          <ProseH3>A hardcover that survives a childhood</ProseH3>
          <p>
            Printed copies are made to order on thick, glossy stock with a
            hardback binding built for bedtime handling. Production takes{" "}
            {FACTS.productionDaysMin}-{FACTS.productionDaysMax} days, delivery
            across India is free, and you approve the full book before anything
            goes to press.
          </p>

          <ProseH2>KuttyStory at a glance</ProseH2>
          <KeyFacts
            caption="Personalised children's books from KuttyStory"
            rows={[
              ["What it is", "A children's picture book starring your own child, by name and face"],
              ["Ages", `${FACTS.ageRange} (each title lists its own range)`],
              ["Languages", "English. Tamil editions are planned, not yet available"],
              ["Book length", "24-28 illustrated pages, plus a dedication page you write"],
              ["Free preview", `Front cover and the first ${FACTS.freePreviewPages} pages, before any payment`],
              ["Instant PDF", `From ${inr(fromPdf)}, downloadable minutes after payment`],
              ["Printed hardcover", `From ${inr(fromPrint)}, free delivery across India`],
              ["Production time", `${FACTS.productionDaysMin}-${FACTS.productionDaysMax} days, then 2-7 days in transit`],
              ["Multi-book discount", "20% off two or more books with the code STORY20"],
              ["Payment", "UPI, credit card, debit card and net banking via Razorpay"],
              ["Photo privacy", "Used only to make your book, never sold, deleted after the reprint window"],
            ]}
          />

          <ProseH2>Choosing a book by your child&apos;s age</ProseH2>
          <p>
            Age matters more than theme with picture books, because a toddler
            wants rhythm and repetition while a six-year-old wants a plot. A
            rough guide:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-slate-deep">Ages 1-3.</strong> Short,
              soothing, repetitive. Bedtime stories work best - your child is
              looking at pictures more than following events.
            </li>
            <li>
              <strong className="text-slate-deep">Ages 2-6.</strong> Learning
              books earn their keep here: alphabet and counting titles turn a
              letter or a number into a scene your child stars in.
            </li>
            <li>
              <strong className="text-slate-deep">Ages 4-8.</strong> Adventures.
              A quest with a beginning, a wobble and a win - space missions,
              jungle parades, coral reefs - is where seeing yourself as the hero
              does the most for confidence.
            </li>
          </ul>
          <p>
            Every title in the{" "}
            <Link
              href="/stories"
              className="font-semibold text-brand-primary hover:underline"
            >
              story library
            </Link>{" "}
            carries its own age label, so you can filter to the right shelf
            before you personalise anything.
          </p>

          <ProseH2>When Indian parents order a personalised book</ProseH2>
          <p>
            Birthdays are the big one - both as the main gift and as a{" "}
            <Link
              href="/birthday-return-gifts"
              className="font-semibold text-brand-primary hover:underline"
            >
              birthday return gift
            </Link>{" "}
            that the other children actually keep. After that come first
            birthdays and naming days, Diwali and Christmas, a new sibling
            arriving, a first day of school, and grandparents abroad who want to
            send something that is not a toy.
          </p>
          <p>
            For anything with a deadline, order the printed hardcover at least
            two weeks ahead. If the date is sooner than that, the instant PDF is
            ready within minutes of payment and still reads as a real gift -
            plenty of parents send the PDF on the day and let the hardcover
            arrive later.
          </p>

          <ProseH2>How to make one</ProseH2>
          <p>
            Pick a story, upload a clear front-facing photo, type your
            child&apos;s first name and age, and a free preview appears in about
            a minute. If you like it, unlock the PDF or order the hardcover; if
            you do not, close the tab and you have paid nothing.{" "}
            <Link
              href="/how-it-works"
              className="font-semibold text-brand-primary hover:underline"
            >
              See the full process
            </Link>{" "}
            or{" "}
            <Link
              href="/stories"
              className="font-semibold text-brand-primary hover:underline"
            >
              browse the library
            </Link>{" "}
            to start.
          </p>
        </Prose>
      </div>
    </section>
  );
}
