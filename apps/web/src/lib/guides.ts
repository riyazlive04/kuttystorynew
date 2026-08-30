import type { Faq } from "./faqs";

/**
 * The parent guides cluster.
 *
 * Product pages answer "where do I buy this". Nothing on the site answered the
 * questions people actually type before they know a brand exists — which photo
 * to use, what suits a four-year-old, what separates a good personalised book
 * from a bad one. Those informational queries are where AI Overviews and
 * assistants source their answers, and every competitor outranking us for the
 * commercial terms got there partly on the back of a blog.
 *
 * Content rules for anything added here:
 *  - Answer the question in the first two sentences of the section. Assistants
 *    quote openings; they rarely quote conclusions.
 *  - Prefer a number to an adjective, and never state a number that is not
 *    already true elsewhere on the site.
 *  - Be genuinely useful even to someone who buys from somebody else. A guide
 *    written purely as a funnel reads like one, and gets cited by nobody.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; caption: string; rows: [string, string][] };

export interface Guide {
  slug: string;
  /** The on-page H1. */
  title: string;
  /** Bare <title>; the root layout appends the brand. Keep under ~58 chars. */
  metaTitle: string;
  description: string;
  /** ISO dates. `updated` is what Google and answer engines show as freshness. */
  published: string;
  updated: string;
  keywords: string[];
  readingMinutes: number;
  /** One paragraph that answers the headline question outright. */
  intro: string;
  sections: { h2: string; blocks: Block[] }[];
  faqs: Faq[];
}

export const GUIDES: Guide[] = [
  {
    slug: "best-photo-for-a-personalised-book",
    title: "How to take the best photo for a personalised book",
    metaTitle: "The Best Photo for a Personalised Book",
    description:
      "The photo decides how much a personalised book looks like your child. What to shoot, what to avoid, and how to fix a preview that came out wrong - in about five minutes.",
    published: "2026-08-30",
    updated: "2026-08-30",
    readingMinutes: 5,
    keywords: [
      "best photo for personalised book",
      "what photo to upload for a custom storybook",
      "photo tips for personalised children's book",
      "child photo not matching illustration",
    ],
    intro:
      "One clear, front-facing photo of your child's face, taken in soft daylight with nothing shading their eyes, will beat any number of casual snaps. The photo is the single biggest factor in whether a personalised book looks like your child, and it takes about two minutes to get right.",
    sections: [
      {
        h2: "What a good photo looks like",
        blocks: [
          {
            type: "p",
            text: "Illustration from a photo works the way a portrait painter works: it can only draw what it can see. A face that is small, dark, angled away or half-covered gives it less to go on, and the result drifts towards a generic child. Five things do almost all the work.",
          },
          {
            type: "ul",
            items: [
              "**Front-facing.** Your child looking straight at the lens, not three-quarters and not in profile. Eyes open and visible.",
              "**Soft, even light.** Stand them a metre from a window on a bright day, with the window in front of them. Indirect daylight beats both direct sun and a ceiling bulb.",
              "**Face large in the frame.** Head and shoulders. A face that is fifty pixels wide inside a wide holiday photo has nothing usable in it.",
              "**Nothing across the face.** No sunglasses, no cap brim shadowing the eyes, hair pushed back, no hand or toy in the way.",
              "**Only your child.** One face in the frame removes any ambiguity about which one to illustrate.",
            ],
          },
          {
            type: "p",
            text: "A plain phone photo taken next to a window on an ordinary afternoon is genuinely ideal. Studio portraits are not better, and heavily edited or filtered images are usually worse — beauty filters smooth away exactly the features that make a face recognisable.",
          },
        ],
      },
      {
        h2: "What makes a preview come out wrong",
        blocks: [
          {
            type: "p",
            text: "Almost every disappointing likeness traces back to one of a short list of problems with the source photo. If a preview does not look like your child, check these before anything else.",
          },
          {
            type: "table",
            caption: "Common photo problems and what they do to the artwork",
            rows: [
              ["Side profile or head turned", "Face shape and eye spacing get guessed, so the result looks like a cousin rather than your child"],
              ["Backlit — window or sun behind them", "The face is in shadow; skin tone and features come out flat or wrong"],
              ["Dim indoor light", "Grain and colour noise smear fine detail, especially around the eyes"],
              ["Motion blur", "Edges soften and the likeness generalises"],
              ["Group photo", "The face is too small to carry detail, and it is not always clear which child is yours"],
              ["Sunglasses, hats, hair over the eyes", "The eyes are the most identifying feature of a child's face; covering them costs the most"],
              ["Heavy filter or beauty smoothing", "Removes the small asymmetries that make the face recognisably theirs"],
            ],
          },
        ],
      },
      {
        h2: "Fixing it takes one minute",
        blocks: [
          {
            type: "p",
            text: "With any personalised book worth buying, you should be able to regenerate the preview with a different photo before paying anything. At KuttyStory the preview is free and unlimited: upload another photo, generate again, and keep going until it looks like them. Nothing is charged until you choose to unlock the book.",
          },
          {
            type: "ol",
            items: [
              "Take a fresh photo near a window, child facing the camera, head and shoulders in frame.",
              "Upload it in place of the old one and generate the preview again.",
              "Compare the two previews side by side rather than judging one on its own — differences are much easier to see in a pair.",
              "If it still is not right, try a photo taken at a different time of day. Light is usually the variable that changed.",
            ],
          },
          {
            type: "p",
            text: "Uploading two or three good photos of the same child, when a service accepts them, generally helps more than uploading one perfect one — more angles of the same face means less guessing.",
          },
        ],
      },
      {
        h2: "A note on other people's children",
        blocks: [
          {
            type: "p",
            text: "If you are making a book as a gift, ask the child's parent for the photo directly. You need their permission anyway, they will pick a better photo than you would, and it saves you from cropping a face out of a group shot from a birthday party two years ago. Ask for the name spelled the way the family spells it while you are at it — [getting the spelling wrong](/contact) is the other thing that ruins a keepsake.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How many photos do I need for a personalised book?",
        a: "One good photo is enough. A clear, front-facing, well-lit head-and-shoulders shot of your child alone will produce a better result than several casual or angled photos. Where a service accepts more than one, two or three photos of the same child from slightly different angles help more than a single perfect one.",
      },
      {
        q: "Can I use a photo of my child wearing glasses?",
        a: "Prescription glasses are usually fine as long as the eyes are clearly visible through them and there is no glare on the lenses. Sunglasses are not - the eyes are the most identifying part of a child's face, and covering them is the fastest way to lose the likeness.",
      },
      {
        q: "What if the preview does not look like my child?",
        a: "Upload a different photo and generate the preview again. At KuttyStory previews are free and unlimited, and you pay nothing until you unlock the book, so there is no cost to trying two or three photos. The usual fix is a brighter, more front-facing shot taken near a window.",
      },
    ],
  },
  {
    slug: "choosing-a-personalised-book-by-age",
    title: "Choosing a personalised book by your child's age",
    metaTitle: "Choosing a Personalised Book by Age",
    description:
      "What actually works at 1, at 4 and at 7. A practical guide to picking a personalised story book by age rather than by cover art, with what to look for at each stage.",
    published: "2026-08-30",
    updated: "2026-08-30",
    readingMinutes: 6,
    keywords: [
      "personalised book for 2 year old",
      "best story book for 4 year old India",
      "personalised book for 6 year old",
      "choosing children's books by age",
      "picture book age guide",
    ],
    intro:
      "Age matters more than theme when you are choosing a picture book. A one-year-old wants rhythm and pictures to point at, a four-year-old wants a small problem solved, and a seven-year-old wants a plot with stakes. Pick the age band first and the theme second, and the book gets read a hundred times instead of twice.",
    sections: [
      {
        h2: "Ages 1 to 3: rhythm, repetition and short",
        blocks: [
          {
            type: "p",
            text: "At this age the book is an object as much as a story. Your child is looking at pictures, pointing, and joining in on lines they have memorised. Plot barely registers. What works is a strong repeating pattern, a small number of words per page, and pictures with one obvious thing happening in them.",
          },
          {
            type: "p",
            text: "Bedtime titles are the natural fit here: they are deliberately slow, they end somewhere calm, and the repetition is the point rather than a limitation. A personalised bedtime book has an extra advantage at this age — hearing their own name in the rhythm is often what first makes a toddler realise the book is about them.",
          },
          {
            type: "ul",
            items: [
              "Look for: repeating lines, under about 25 words a page, one clear subject per illustration.",
              "Avoid: multi-strand plots, long paragraphs, anything with jeopardy in it near bedtime.",
              "Format note: at this age a hardcover survives, a paperback does not.",
            ],
          },
        ],
      },
      {
        h2: "Ages 2 to 6: learning books earn their keep",
        blocks: [
          {
            type: "p",
            text: "This is the band where alphabet, counting and phonics books are worth buying rather than tolerating. The child is actively decoding — letters, numbers, first sounds — and a book that turns each letter into a scene they star in gives them a reason to keep going past F.",
          },
          {
            type: "p",
            text: "The personalisation does real work here rather than being decoration. A letter book where your child is the astronaut on A and the butterfly-chaser on B holds attention through all twenty-six pages, which is more than can be said for most alphabet books. Look for rhyming or phonics-friendly text, because that is what makes the letters stick.",
          },
          {
            type: "ul",
            items: [
              "Look for: rhyme, one concept per spread, a character your child recognises as themselves.",
              "Avoid: books that teach letter names without sounds, and any book with more than one idea per page.",
              "Worth checking: whether the artwork actually changes per page, or the same figure is pasted twenty-six times.",
            ],
          },
        ],
      },
      {
        h2: "Ages 4 to 8: give them a plot",
        blocks: [
          {
            type: "p",
            text: "By four, a child wants a story with a shape: something goes wrong, the hero does something about it, it comes right. This is the age where being the hero of the book stops being cute and starts doing something — a child who has just read a book in which they captained a starship or led a jungle parade carries a bit of that around for a while.",
          },
          {
            type: "p",
            text: "Adventure titles fit best. Look for a real problem in the middle of the book rather than a tour of nice places, and for text that trusts the reader — longer sentences, some words they do not know yet. Books at this age get re-read for the story, not the rhythm, so the story has to hold up.",
          },
          {
            type: "ul",
            items: [
              "Look for: a genuine problem and a resolution the child causes, not one that happens to them.",
              "Avoid: books pitched below their reading level to be safe — under-pitching is the more common mistake at this age.",
              "Worth checking: page count. Under about 24 pages there is rarely room for a plot.",
            ],
          },
        ],
      },
      {
        h2: "Quick reference",
        blocks: [
          {
            type: "table",
            caption: "What to look for at each age",
            rows: [
              ["1-3 years", "Repetition, rhythm, few words per page. Bedtime and first-concept books. Hardcover."],
              ["2-6 years", "Alphabet, counting and phonics. Rhyme, one idea per spread, artwork that changes per page."],
              ["4-8 years", "Adventure with a real problem and a resolution the child drives. 24+ pages."],
              ["Reading aloud", "Every age. These are books a parent reads out, so cadence matters more than reading level."],
              ["Straddling two bands", "Buy for the older end if the child is read to often, the younger end if they are not."],
            ],
          },
          {
            type: "p",
            text: "Every title in the [KuttyStory library](/stories) carries its own age label, and you can filter by it before personalising anything. If you are buying for someone else's child and are not sure of the age, the 4-8 adventure titles are the safest guess — they get read at three with skipping, and at nine with nostalgia.",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "What age is a personalised story book best for?",
        a: "Personalised story books work best between ages 1 and 8, which is when picture books are read aloud and when a child is old enough to recognise their own name and face but young enough to find it genuinely thrilling. KuttyStory titles cover that range, with each book carrying its own recommended age band.",
      },
      {
        q: "Is a personalised book worth it for a one-year-old?",
        a: "Yes, but choose a bedtime or first-concept title rather than an adventure, and buy the hardcover. At one, the appeal is rhythm, pictures and hearing their own name in the text - plot means nothing yet. It also tends to become the keepsake copy the family keeps, which a paperback will not survive.",
      },
      {
        q: "My child is between two age bands. Which do I pick?",
        a: "Pick the older band if your child is read to most days, and the younger one if they are not. Read-aloud books are pitched at listening comprehension rather than reading level, and a child who is read to regularly runs about a year ahead of the label on the cover.",
      },
    ],
  },
  {
    slug: "how-to-choose-a-personalised-story-book",
    title: "How to choose a personalised story book: 7 things to check",
    metaTitle: "How to Choose a Personalised Story Book",
    description:
      "Not all personalised children's books are the same. Seven checks - face or name only, free preview, page count, print quality, photo privacy, delivery and refunds - before you order one in India.",
    published: "2026-08-30",
    updated: "2026-08-30",
    readingMinutes: 7,
    keywords: [
      "how to choose a personalised story book",
      "best personalised books for kids India",
      "personalised book buying guide",
      "are personalised books worth it",
      "custom children's book comparison",
    ],
    intro:
      "The phrase \"personalised book\" covers everything from a name printed on a cover to a child's face illustrated into every page, at prices from a few hundred rupees to a few thousand. Seven checks separate the two, and all of them can be made before you pay: what is actually personalised, whether you can preview it free, page count, print quality, what happens to the photo, delivery time, and the refund policy.",
    sections: [
      {
        h2: "1. Is the face personalised, or only the name?",
        blocks: [
          {
            type: "p",
            text: "This is the biggest difference in the category and the hardest to see from a product photo. Name-only books print your child's name into a fixed story with fixed artwork — cheap, fast, and a five-year-old works out within two pages that the child in the pictures is not them. Face-personalised books illustrate your child's likeness into the scenes, which is what makes them look at it twice.",
          },
          {
            type: "p",
            text: "How to check: look for a preview of interior pages, not just the cover, and see whether the child in them changes. If every marketing image shows the same illustrated child with a different name, it is a name-only book.",
          },
        ],
      },
      {
        h2: "2. Can you see it before you pay?",
        blocks: [
          {
            type: "p",
            text: "Any personalised book you cannot preview before paying is a gamble, because the whole product is the likeness and you have no idea whether it worked. A free preview of the cover and several interior pages, with no signup, should be the baseline. KuttyStory shows the front cover and the first 5 pages free, and lets you regenerate with a different photo as often as you like before deciding.",
          },
          {
            type: "p",
            text: "Watch for the difference between a preview and a mockup. A mockup shows you what the layout will look like; a preview shows you your actual child in your actual book.",
          },
        ],
      },
      {
        h2: "3. Page count and what fills them",
        blocks: [
          {
            type: "p",
            text: "Under about 20 pages there is not room for a story, only a sequence of scenes. Twenty-four to thirty-two pages is the standard picture-book range and where most good personalised titles sit. More important than the number is whether the artwork actually changes per page — some books pad the count with text-only spreads or repeat the same illustration with a different background colour.",
          },
        ],
      },
      {
        h2: "4. Print quality, if you are buying a physical book",
        blocks: [
          {
            type: "p",
            text: "For a book that will be handled by a three-year-old at bedtime, three things matter: hardback binding rather than stapled paperback, thick glossy or matte stock rather than office paper, and colour that has not been printed too dark. Ask what paper weight is used if it is not stated. If a listing does not mention binding at all, assume paperback.",
          },
          {
            type: "p",
            text: "The instant-PDF option is not a lesser product, it is a different one. It is the right buy when the deadline is this week, when the recipient is overseas, or when you want to read it on a tablet. Many parents buy both.",
          },
        ],
      },
      {
        h2: "5. What happens to your child's photograph",
        blocks: [
          {
            type: "p",
            text: "You are uploading a picture of a child, so this deserves an actual answer rather than a reassuring adjective. Look for four specific statements: the photo is used only to make the book, it is not sold or shared with advertisers, it is not used to train anything, and it is deleted after a stated period. A vendor that will not say what it deletes and when has told you something.",
          },
          {
            type: "p",
            text: "KuttyStory's position, set out in full in the [privacy policy](/privacy): photos are used solely to illustrate your book, never sold or shared with advertisers, deleted once the order is complete and the reprint window has closed, and deleted within 7 days of an emailed request if you want them gone sooner.",
          },
        ],
      },
      {
        h2: "6. Delivery time against your actual deadline",
        blocks: [
          {
            type: "p",
            text: "Personalised books are made to order, so the timeline has two parts and vendors often quote only one. Production is typically 4-7 days. Transit across India adds roughly 2-7 more depending on the state. Two weeks ahead of a birthday is comfortable; one week is not, and that is the point at which the PDF edition stops being a compromise and starts being the sensible choice.",
          },
          {
            type: "table",
            caption: "Ordering against a deadline",
            rows: [
              ["3+ weeks out", "Printed hardcover, no stress"],
              ["2 weeks out", "Printed hardcover, order today"],
              ["1 week out", "Instant PDF, or print plus PDF as a hedge"],
              ["Days out", "Instant PDF - ready minutes after payment"],
            ],
          },
        ],
      },
      {
        h2: "7. What happens if it arrives wrong",
        blocks: [
          {
            type: "p",
            text: "Personalised goods are generally exempt from standard return rights, which is reasonable — a book with someone else's child in it cannot be resold. What you should still get is a reprint or refund when the book arrives damaged, misprinted, or materially different from the preview you approved. Check the window: seven days from delivery is normal, and photographs of the problem are usually required.",
          },
          {
            type: "p",
            text: "The corollary is that the preview approval matters. Read it properly before you approve a print run, because after that the file is at the printer and the spelling of your child's name is permanent.",
          },
        ],
      },
      {
        h2: "The short version",
        blocks: [
          {
            type: "table",
            caption: "Seven checks before ordering a personalised book",
            rows: [
              ["Personalisation", "Face illustrated into every page, not just a name printed in"],
              ["Preview", "Free, real, before payment - and regenerable with a different photo"],
              ["Length", "24-32 pages, with artwork that changes on every one"],
              ["Print", "Hardback binding, thick stock, if you are buying physical"],
              ["Photo policy", "Stated use, no resale, no ad use, and a deletion timeline"],
              ["Delivery", "Production plus transit, checked against your real deadline"],
              ["If it goes wrong", "Reprint or refund for damage or misprint, with a stated window"],
            ],
          },
          {
            type: "p",
            text: "KuttyStory is built to pass all seven: face-personalised artwork, a free 5-page preview with unlimited regeneration, 24-28 page books, made-to-order hardcovers with free India delivery, a written photo-deletion policy, and reprints or refunds within 7 days of delivery. [Browse the library](/stories) or [see how it works](/how-it-works).",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Are personalised children's books worth the money?",
        a: "They are worth it when the book is genuinely personalised - your child's face illustrated into every page rather than a name printed into a fixed story - and when you can preview it free before paying. At that point you are buying a keepsake that gets re-read, not a novelty. A name-only book at any price usually is not worth it, because children notice quickly that the child in the pictures is not them.",
      },
      {
        q: "How much should a personalised story book cost in India?",
        a: "Expect roughly 700 to 1,000 rupees for a digital edition and 1,300 to 2,800 rupees for a printed hardcover, depending on page count and print quality. KuttyStory books start at 749 rupees for the instant PDF and 1,299 rupees for the printed hardcover, with delivery included anywhere in India.",
      },
      {
        q: "What is the difference between a name-personalised and a face-personalised book?",
        a: "A name-personalised book prints your child's name into a fixed story with fixed illustrations. A face-personalised book illustrates your child's actual likeness into the artwork on every page, so the character in the pictures is recognisably them. The second costs more and is the reason children keep the book.",
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
