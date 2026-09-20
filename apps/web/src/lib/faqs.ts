/**
 * Single source of truth for the storefront FAQ: rendered by <Faq /> and marked
 * up as FAQPage JSON-LD. Keeping one list means the schema can never drift from
 * what the page actually says.
 *
 * Google now shows FAQ rich results only for government and health sites, so
 * these are not written for a star-rating snippet. They are written to be
 * *quoted*: AI Overviews, ChatGPT and Perplexity lift whole answers out of
 * FAQPage markup, and they favour answers that open with the fact rather than
 * building up to it. Hence every answer here leads with a direct sentence -
 * price, number of days, yes or no - before any colour. Facts must match
 * /terms and /privacy exactly, because a contradiction between two pages on the
 * same domain is what makes an answer engine hedge or drop the citation.
 */
export type Faq = { q: string; a: string };

/** Shown on the home page and /how-it-works. */
export const FAQS: Faq[] = [
  {
    q: "What is a personalized story book?",
    a: "A personalized story book is a children's book in which your own child is the main character - their first name is written into the text and their face is illustrated into the artwork on every page. A KuttyStory book is a 24-28 page picture book built this way from one photo and a few details, so the child recognises themselves as the hero rather than reading about a stranger.",
  },
  {
    q: "How does the personalization work?",
    a: "You give us your child's first name, age and a photo. Our illustration studio weaves them into a professionally written story so your child stars on every page - name in the text, likeness in the artwork, and a character look you choose. The whole thing takes about a minute, and you see the result before you pay anything.",
  },
  {
    q: "Is the preview really free?",
    a: "Yes. You get the front cover and the first 5 pages instantly, with no signup and no payment. You only pay when you decide to unlock the full book as a PDF or order a printed copy, so you always know exactly what you are buying.",
  },
  {
    q: "How much does a personalized story book cost in India?",
    a: "Every KuttyStory book is Rs. 399 for the instant PDF, Rs. 799 for the staple bound printed book and Rs. 1,299 for the premium hardbound edition, with free delivery anywhere in India on both printed editions. 2 or more books get 20% off with the code STORY20. Payment is in Indian Rupees through Razorpay - UPI, credit card, debit card or net banking.",
  },
  {
    q: "What age are these books for?",
    a: "KuttyStory titles are written for children aged 1 to 8. Each book lists its own range - bedtime titles start at age 1, alphabet and counting books suit ages 2-6, and the adventure titles read best from 4-8. Choose by the age label on the story, not by reading level, because a parent reads these aloud.",
  },
  {
    q: "Which photo works best?",
    a: "One clear, well-lit, front-facing photo of your child's face works best - eyes open, no sunglasses, no hat shading the face, and nobody else in the frame. A plain phone photo taken near a window is ideal. Blurry, dark or side-profile photos are the single most common reason a preview looks off, and you can simply re-upload and regenerate for free if it does.",
  },
  {
    q: "Are my child's photos safe?",
    a: "Yes. Photos you upload are used for one purpose only - illustrating your book. They are never sold, never shared with advertisers and never used to market to you. They are deleted once your order is complete and the reprint window has closed, and if you want them removed sooner we will delete them within 7 days of your emailing us. Card and banking details go straight to Razorpay and never touch KuttyStory servers.",
  },
  {
    q: "How long does printing and delivery take?",
    a: "Printed hardcovers are made to order and take 4-7 days to produce, then ship free anywhere in India. Delivery time after that depends on the destination state - typically 2-7 days. The instant PDF is different: it is available for download within minutes of payment, which is why it is the usual choice for a gift needed the same week.",
  },
  {
    q: "Can I order personalized books as birthday return gifts?",
    a: "Yes. A personalized storybook is one of the few return gifts a child keeps, and each one is made for the specific child receiving it. Order 2 or more books and the code STORY20 takes 20% off. For a party-sized batch, message us on WhatsApp with the number of books and the date you need them by, and we will confirm the timeline before you order.",
  },
  {
    q: "Do you have books in Tamil?",
    a: "Not yet. Every KuttyStory title is currently written in English. Tamil editions are in the works - the brand name itself comes from the Tamil word kutty, meaning little one - and the story pages will show a Tamil badge as soon as a title is available in it.",
  },
  {
    q: "What if I am not happy with my book?",
    a: "Because you approve the full preview before paying, surprises are rare. If a printed copy arrives damaged, misprinted or materially different from the preview you approved, contact us within 7 days of delivery with photographs and we will reprint or refund it at no cost.",
  },
];

/** Gift-intent set for /birthday-return-gifts, so that page carries its own
 *  FAQPage markup instead of duplicating the home page's. */
export const GIFT_FAQS: Faq[] = [
  {
    q: "Are personalized books a good birthday return gift?",
    a: "Yes - a personalized book is the rare return gift that does not end up in a drawer. Because the child's own name and face are inside it, it reads as a keepsake rather than party swag, and parents keep it on the shelf. Costed per guest it sits above a toy, so it suits smaller guest lists or a headline gift for close friends.",
  },
  {
    q: "How many books can I order at once?",
    a: "There is no fixed limit. Two or more books get 20% off with the code STORY20. Each book is personalized separately, so you will need a name and a photo for every child - message us on WhatsApp with your list and party date and we will confirm the production timeline before you pay.",
  },
  {
    q: "How far ahead should I order for a birthday?",
    a: "Order printed hardcovers at least 2 weeks before the party. Production takes 4-7 days and delivery across India adds roughly 2-7 more depending on your state. If the party is sooner than that, the instant PDF is ready minutes after payment and can be printed locally or gifted as a digital book.",
  },
  {
    q: "Can I add a personal message to the book?",
    a: "Yes. Every book has a dedication page you write yourself - a birthday line, the date, or a note from the whole family. It appears at the front of the book, before the story starts, and is included in the free preview so you can check it before paying.",
  },
  {
    q: "Do you deliver across India?",
    a: "Yes, delivery is free to every state in India. Printed hardcovers are produced within 4-7 days and shipped from there; the instant PDF has no delivery step at all and is available anywhere immediately after payment.",
  },
];

/** Everything, for the llms.txt digest and internal search. */
export const ALL_FAQS: Faq[] = [...FAQS, ...GIFT_FAQS];
