"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut, Menu, Phone, ShoppingBag, User, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCustomerAuth, formatIndianPhone } from "@/lib/auth";
import { BrandLogo } from "./BrandLogo";
import { AnnouncementBar } from "./AnnouncementBar";
import { PhoneLoginModal } from "./PhoneLoginModal";

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
  const [showLoginModal, setShowLoginModal] = useState(false);
  const count = useCart((s) => s.count());
  const { customer, isLoggedIn, logout } = useCustomerAuth();

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
            {mounted && isLoggedIn && customer ? (
              <div className="hidden items-center gap-1.5 rounded-2xl border border-brand-borderAccent bg-brand-cream px-3 py-1.5 text-xs font-bold text-slate-deep md:flex">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{formatIndianPhone(customer.phone)}</span>
                <button
                  onClick={logout}
                  title="Log out"
                  className="ml-1 rounded p-1 text-slate-400 hover:text-rose-600 transition"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : mounted ? (
              <button
                type="button"
                onClick={() => setShowLoginModal(true)}
                className="hidden items-center gap-1.5 rounded-2xl border-2 border-brand-borderAccent bg-white px-3.5 py-2 text-xs font-bold text-slate-deep transition hover:border-brand-primary md:inline-flex"
              >
                <Phone className="h-3.5 w-3.5 text-brand-primary" />
                Sign In
              </button>
            ) : null}

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
              {mounted && isLoggedIn && customer ? (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-brand-lilac/70 px-3 py-2 text-xs font-bold text-slate-deep">
                  <span className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    {formatIndianPhone(customer.phone)}
                  </span>
                  <button
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="text-rose-600 hover:underline"
                  >
                    Log Out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setShowLoginModal(true);
                  }}
                  className="mb-1 rounded-xl border border-slate-200 px-3 py-2 text-left font-semibold text-brand-primary"
                >
                  Sign In with Phone
                </button>
              )}

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

      <PhoneLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        title="Sign In to KuttyStory"
        subtitle="Access your personalized books, previews, and orders."
      />
    </header>
  );
}
