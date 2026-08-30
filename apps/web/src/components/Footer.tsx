import Link from "next/link";
import { BrandLogo } from "./BrandLogo";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-brand-borderAccent bg-white">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <BrandLogo className="h-20 w-20" />
          {/* Says English only, on purpose. Tamil titles do not exist yet, and
              a claim here that the catalogue contradicts is exactly the kind of
              inconsistency that makes an answer engine describe the site
              wrongly — or stop citing it. */}
          <p className="mt-4 max-w-xs text-sm text-slate-mutedText">
            Personalised storybooks that make your child the hero - their name
            and face on every page. Written in English, printed and delivered
            across India.
          </p>
        </div>

        {/* The footer is the only place every indexable page is linked from, so
            it carries the routes that have no slot in the top nav. */}
        <FooterCol
          title="Explore"
          links={[
            { label: "Story Library", href: "/stories" },
            { label: "How It Works", href: "/how-it-works" },
            { label: "Birthday Return Gifts", href: "/birthday-return-gifts" },
            { label: "Guides for Parents", href: "/guides" },
            { label: "Pricing", href: "/#pricing" },
          ]}
        />
        <FooterCol
          title="Support"
          links={[
            { label: "Contact Us", href: "/contact" },
            { label: "FAQ", href: "/#faq" },
            { label: "Shipping & Returns", href: "/terms" },
            {
              label: "Choosing a book by age",
              href: "/guides/choosing-a-personalised-book-by-age",
            },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { label: "About KuttyStory", href: "/about" },
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
          ]}
        />
      </div>
      <div className="border-t border-slate-100">
        <div className="container-x flex flex-col items-center justify-between gap-2 py-5 text-sm text-slate-mutedText md:flex-row">
          <p>© {new Date().getFullYear()} KuttyStory. All rights reserved.</p>
          <p>Made with ♥ for little readers.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-deep">
        {title}
      </h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-sm text-slate-mutedText transition hover:text-brand-primary"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
