"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { BrandLogo } from "./BrandLogo";
import { AnnouncementBar } from "./AnnouncementBar";

// Site-wide links, so every page gets a crawlable path to the routes that earn
// their own search traffic. "Return Gifts" replaces the old /#reviews anchor:
// an in-page anchor adds no link target a crawler did not already have.
const LINKS = [
  { href: "/stories", label: "Story Library" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/birthday-return-gifts", label: "Return Gifts" },
  { href: "/#pricing", label: "Pricing" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const count = useCart((s) => s.count());

  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-50">
      <AnnouncementBar />
      <div className="border-b border-brand-borderAccent/70 bg-brand-cream/90 backdrop-blur-md">
        <nav className="container-x flex h-16 items-center justify-between">
          <BrandLogo priority className="h-14 w-14" />

          <div className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm font-semibold text-slate-mutedText transition hover:text-brand-purple"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/cart"
              className="relative grid h-10 w-10 place-items-center rounded-2xl border-2 border-brand-borderAccent bg-white transition hover:border-brand-primary"
              aria-label="Cart"
            >
              <ShoppingBag className="h-5 w-5 text-slate-deep" />
              {mounted && count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-primary px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
            <Link
              href="/stories"
              className="hidden btn-primary !px-5 !py-2.5 text-sm md:inline-flex"
            >
              Create a Book
            </Link>
            <button
              className="grid h-10 w-10 place-items-center rounded-2xl border-2 border-brand-borderAccent bg-white md:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {open && (
          <div className="border-t border-brand-borderAccent/70 bg-white md:hidden">
            <div className="container-x flex flex-col gap-1 py-3">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2.5 font-semibold text-slate-deep hover:bg-brand-lilac"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/stories"
                onClick={() => setOpen(false)}
                className="btn-primary mt-2"
              >
                Create a Book
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
