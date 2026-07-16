import type { Story } from "./types";

// Curated catalogue of personalizable KuttyStory titles. In production these
// come from the FastAPI /stories endpoint (Postgres). The shape is identical,
// so the frontend can switch sources via NEXT_PUBLIC_API_URL with no changes.
const RAW: Story[] = [
  {
    id: "str_alphabet",
    slug: "the-alphabet-adventure",
    title: "The Alphabet Adventure",
    tagline: "Learn every letter with your little hero leading the way.",
    description:
      "Join your child on a joyful journey through the alphabet. Each page turns a letter into a tiny adventure - A for astronaut, B for butterfly - starring your child by name and face.",
    categoryTag: "LEARNING",
    ageRange: "Ages 2-6",
    pdfPrice: 799,
    printPrice: 1399,
    bilingualAddon: 200,
    pages: 28,
    coverImage:
      "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=800&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&q=80&auto=format&fit=crop",
    ],
    themeColor: "#FF6F61",
    supportsTamil: true,
    highlights: [
      "26 letter-themed illustrated scenes",
      "Your child's name woven into every page",
      "Phonics-friendly rhyming text",
    ],
  },
  {
    id: "str_space",
    slug: "journey-to-the-stars",
    title: "Journey to the Stars",
    tagline: "Blast off on a cosmic mission across the galaxy.",
    description:
      "Your child becomes the captain of the starship Kutty-1, exploring planets, meeting friendly aliens and painting the sky with comets - all personalized with their name and likeness.",
    categoryTag: "ADVENTURE",
    ageRange: "Ages 4-8",
    pdfPrice: 899,
    printPrice: 1499,
    bilingualAddon: 200,
    pages: 28,
    coverImage:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=600&q=80&auto=format&fit=crop",
    ],
    themeColor: "#6366F1",
    supportsTamil: true,
    highlights: [
      "A galaxy-spanning space quest",
      "Confidence-building 'you can do it' narrative",
      "Glow-in-imagination night scenes",
    ],
  },
  {
    id: "str_jungle",
    slug: "the-great-jungle-parade",
    title: "The Great Jungle Parade",
    tagline: "Lead a marching band of friendly jungle animals.",
    description:
      "Elephants, peacocks and tiny mice all follow your child through a lush, musical jungle. A warm story about kindness, courage and leading with a smile.",
    categoryTag: "IMAGINATION",
    ageRange: "Ages 2-6",
    pdfPrice: 799,
    printPrice: 1399,
    bilingualAddon: 200,
    pages: 28,
    coverImage:
      "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=800&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1474314170901-f351b68f544f?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1549366021-9f761d450615?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=600&q=80&auto=format&fit=crop",
    ],
    themeColor: "#10B981",
    supportsTamil: true,
    highlights: [
      "Rich, hand-painted jungle artwork",
      "Introduces 12 animals by name",
      "A gentle lesson about friendship",
    ],
  },
  {
    id: "str_dreams",
    slug: "goodnight-little-dreamer",
    title: "Goodnight, Little Dreamer",
    tagline: "A soothing bedtime voyage through cloud castles.",
    description:
      "The perfect wind-down story. Your child floats past moon-lit cloud castles and sleepy stars, drifting gently toward the sweetest dreams. Personalized and calm.",
    categoryTag: "BEDTIME",
    ageRange: "Ages 1-5",
    pdfPrice: 749,
    printPrice: 1299,
    bilingualAddon: 200,
    pages: 24,
    coverImage:
      "https://images.unsplash.com/photo-1439405326854-014607f694d7?w=800&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1532978379173-523e16f371f9?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1475924156734-496f6968e0e6?w=600&q=80&auto=format&fit=crop",
    ],
    themeColor: "#8B5CF6",
    supportsTamil: true,
    highlights: [
      "Calm, rhythmic bedtime prose",
      "Soft pastel dreamscape art",
      "Ends with your child fast asleep",
    ],
  },
  {
    id: "str_ocean",
    slug: "under-the-coral-sea",
    title: "Under the Coral Sea",
    tagline: "Dive deep and befriend the creatures of the reef.",
    description:
      "Your child becomes an underwater explorer, discovering rainbow reefs, playful dolphins and a hidden pearl. A vibrant adventure about curiosity and caring for our oceans.",
    categoryTag: "ADVENTURE",
    ageRange: "Ages 3-7",
    pdfPrice: 849,
    printPrice: 1449,
    bilingualAddon: 200,
    pages: 28,
    coverImage:
      "https://images.unsplash.com/photo-1518877593221-1f28583780b4?w=800&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1546026423-cc4642628d2b?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&q=80&auto=format&fit=crop",
    ],
    themeColor: "#0EA5E9",
    supportsTamil: false,
    highlights: [
      "Immersive under-the-sea illustrations",
      "Sparks curiosity about marine life",
      "A treasure-hunt story arc",
    ],
  },
  {
    id: "str_counting",
    slug: "counting-with-kutty",
    title: "Counting with Kutty",
    tagline: "From one shy snail to ten dancing fireflies.",
    description:
      "A playful early-numbers book. Your child counts their way through a magical garden, meeting more friends on every page. Numbers, colours and giggles all in one.",
    categoryTag: "LEARNING",
    ageRange: "Ages 2-5",
    pdfPrice: 749,
    printPrice: 1299,
    bilingualAddon: 200,
    pages: 24,
    coverImage:
      "https://images.unsplash.com/photo-1499346030926-9a72daac6c63?w=800&q=80&auto=format&fit=crop",
    gallery: [
      "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&q=80&auto=format&fit=crop",
    ],
    themeColor: "#F59E0B",
    supportsTamil: true,
    highlights: [
      "Numbers 1 to 10 with counting prompts",
      "Bright, cheerful garden artwork",
      "Interactive 'can you find?' moments",
    ],
  },
];

// Use bundled, self-contained artwork so images never depend on a remote host
// or the image optimizer. Replace /covers/*.svg with real illustrations later.
export const STORIES: Story[] = RAW.map((s) => ({
  ...s,
  coverImage: `/covers/${s.slug}.svg`,
  gallery: [1, 2, 3].map((n) => `/covers/${s.slug}-${n}.svg`),
}));

export function getStory(slug: string): Story | undefined {
  return STORIES.find((s) => s.slug === slug);
}

export const CATEGORIES = [
  { key: "ALL", label: "All Stories" },
  { key: "LEARNING", label: "Learning" },
  { key: "ADVENTURE", label: "Adventure" },
  { key: "IMAGINATION", label: "Imagination" },
  { key: "BEDTIME", label: "Bedtime" },
] as const;
