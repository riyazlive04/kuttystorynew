"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Images,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  PenSquare,
  Settings,
  ShieldCheck,
} from "lucide-react";
import {
  adminApi,
  adminConfigured,
  clearToken,
  getToken,
  setToken,
} from "@/lib/admin";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: Package },
  { href: "/admin/previews", label: "Previews", icon: Images },
  { href: "/admin/stories", label: "Stories", icon: BookOpen },
  { href: "/admin/pages", label: "Page Editor", icon: PenSquare },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!adminConfigured) {
      setAuthed(false);
      return;
    }
    if (getToken()) {
      adminApi.verifyToken().then((ok) => setAuthed(ok));
    } else {
      setAuthed(false);
    }
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError("");
    setToken(tokenInput.trim());
    const ok = await adminApi.verifyToken();
    setChecking(false);
    if (ok) setAuthed(true);
    else {
      clearToken();
      setError("Invalid admin token.");
    }
  }

  function logout() {
    clearToken();
    setAuthed(false);
  }

  if (authed === null) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-cream">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-cream px-4">
        <div className="card w-full max-w-sm p-8">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-primary/10 text-brand-primary">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="text-center text-xl font-bold text-slate-deep">
            KuttyStory Admin
          </h1>
          {!adminConfigured ? (
            <p className="mt-4 text-center text-sm text-slate-mutedText">
              Backend not configured. Set{" "}
              <code className="rounded bg-brand-lilac px-1">
                NEXT_PUBLIC_API_URL
              </code>{" "}
              and run the FastAPI stack to use the dashboard.
            </p>
          ) : (
            <form onSubmit={login} className="mt-5 space-y-3">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Admin token"
                className="w-full rounded-xl border-2 border-brand-borderAccent bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
              {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
              <button className="btn-primary w-full" disabled={checking}>
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sign in"
                )}
              </button>
              <p className="text-center text-xs text-slate-400">
                Dev token: <code>kutty-admin-dev</code>
              </p>
            </form>
          )}
          <Link
            href="/"
            className="mt-5 block text-center text-sm font-semibold text-slate-mutedText hover:text-brand-primary"
          >
            ← Back to store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-brand-cream">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-brand-borderAccent bg-white p-4 md:flex">
        <Link href="/" className="mb-6 px-2 kids text-lg font-bold">
          <span className="text-gradient-brand">Kutty Story</span>
        </Link>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => {
            const active =
              pathname === n.href ||
              (n.href !== "/admin" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-brand-primary text-white"
                    : "text-slate-mutedText hover:bg-brand-lilac"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={logout}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-mutedText transition hover:bg-red-50 hover:text-red-500"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      <div className="flex-1 overflow-x-hidden">
        {/* Mobile top nav */}
        <div className="flex items-center gap-2 border-b border-brand-borderAccent bg-white px-4 py-3 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-mutedText"
            >
              {n.label}
            </Link>
          ))}
        </div>
        <div className="p-5 md:p-8">{children}</div>
      </div>
    </div>
  );
}
