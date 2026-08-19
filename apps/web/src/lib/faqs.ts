/**
 * Single source of truth for the storefront FAQ: rendered by <Faq /> and marked
 * up as FAQPage JSON-LD. Keeping one list means the schema can never drift from
 * what the page actually says.
 */
export const FAQS = [
  {
    q: "How does the personalization work?",
    a: "You give us your child's name, age and a photo. Our illustration studio weaves them into a professionally written story so your child becomes the star of every page.",
  },
  {
    q: "Is the preview really free?",
    a: "Yes! You get an 8-page preview instantly with zero commitment. You only pay when you decide to unlock the full book as a PDF or order a printed copy.",
  },
  {
    q: "Do you support Tamil?",
    a: "Most of our titles are available in English and Tamil. Look for the தமிழ் ✓ badge on a story.",
  },
  {
    q: "How long does printing and delivery take?",
    a: "Printed hardcovers are produced within 2-3 business days and delivered free across India, typically within 4-7 days of your order.",
  },
  {
    q: "What if I'm not happy with my book?",
    a: "Because you approve the full preview before paying, surprises are rare - but if something's wrong with a printed copy, we'll reprint or refund it.",
  },
];
