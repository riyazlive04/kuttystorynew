/**
 * The ordering procedure, in one place: rendered by <Steps /> and emitted as
 * HowTo JSON-LD. Same reason the FAQ lives in one file — a procedure that reads
 * differently in the markup than on the page is a contradiction an answer
 * engine will notice and route around.
 *
 * Each step is written to survive being lifted out on its own, so the text
 * names the thing being done rather than referring back to "it" or "the
 * previous step".
 */
export const HOW_TO_STEPS: { name: string; text: string }[] = [
  {
    name: "Personalise the book",
    text: "Choose a story, then enter your child's first name and age and upload one clear, front-facing photo. Pick their character look — skin tone and boy or girl artwork — so the illustrations match the child you know.",
  },
  {
    name: "See a free preview",
    text: "KuttyStory writes your child into the story and illustrates their face into the artwork, then shows you the front cover and the first 5 pages within about a minute. The preview costs nothing and needs no signup or payment details.",
  },
  {
    name: "Download or print it",
    text: "If you like the preview, unlock the full book. The instant PDF is downloadable within minutes; the premium printed hardcover is made to order in 4-7 days and shipped free anywhere in India.",
  },
];
