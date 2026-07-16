import Link from "next/link";
import { Instagram, Facebook, Mail } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-brand-borderAccent bg-white">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <BrandLogo className="h-20 w-20" />
          <p className="mt-4 max-w-xs text-sm text-slate-mutedText">
            Personalized storybooks that make your child the hero. Crafted with
            love in India, in English and Tamil.
          </p>
          <div className="mt-5 flex gap-3">
            {[Instagram, Facebook, Mail].map((Icon, i) => (
              <span
                key={i}
                className="grid h-9 w-9 place-items-center rounded-xl border-2 border-slate-100 text-slate-mutedText transition hover:border-brand-primary hover:text-brand-primary"
              >
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </div>
        </div>

        <FooterCol
          title="Explore"
          links={[
            { label: "Story Library", href: "/stories" },
            { label: "How It Works", href: "/how-it-works" },
            { label: "Pricing", href: "/#pricing" },
            { label: "Gift Cards", href: "/stories" },
          ]}
        />
        <FooterCol
          title="Support"
          links={[
            { label: "Track Order", href: "/cart" },
            { label: "Shipping & Returns", href: "/how-it-works" },
            { label: "FAQ", href: "/#faq" },
            { label: "Contact Us", href: "mailto:hello@kuttystory.in" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { label: "Our Story", href: "/how-it-works" },
            { label: "Privacy Policy", href: "/#" },
            { label: "Terms of Service", href: "/#" },
            { label: "Careers", href: "/#" },
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
