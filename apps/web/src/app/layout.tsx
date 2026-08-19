import type { Metadata } from "next";
import Script from "next/script";
import { Fredoka, Nunito, Baloo_Thambi_2 } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

const balooTamil = Baloo_Thambi_2({
  subsets: ["tamil", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-baloo-tamil",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KuttyStory - Personalized Storybooks Starring Your Child",
  description:
    "Create a beautiful, personalized children's book with your child as the hero. Available in English and Tamil. Instant PDF or premium printed hardcover, delivered across India.",
  keywords: [
    "personalized children's book",
    "kids storybook",
    "Tamil children book",
    "custom story",
    "KuttyStory",
  ],
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  // Let Google show large image thumbnails and full text snippets — this is a
  // visual, gift-driven product where the cover art is the hook.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "KuttyStory - Personalized Storybooks Starring Your Child",
    description:
      "Create a beautiful, personalized children's book with your child as the hero. English & Tamil. Instant PDF or premium print.",
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: "KuttyStory - Personalized Storybooks",
    description:
      "Make your child the hero of their own storybook. English & Tamil.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${nunito.variable} ${balooTamil.variable}`}
    >
      <body className="min-h-screen bg-brand-cream font-bodyText text-slate-deep antialiased">
        {GTM_ID && (
          <>
            <Script id="gtm" strategy="afterInteractive">
              {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
            </Script>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
                height="0"
                width="0"
                style={{ display: "none", visibility: "hidden" }}
              />
            </noscript>
          </>
        )}
        {children}
      </body>
    </html>
  );
}
