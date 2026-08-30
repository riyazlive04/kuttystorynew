import { Truck, ShieldCheck, Star, Package, Gift } from "lucide-react";

const ITEMS = [
  { icon: Truck, title: "Free Shipping", sub: "Across India" },
  { icon: ShieldCheck, title: "Secure Payment", sub: "UPI · Cards · NetBanking" },
  { icon: Package, title: "Made in 4-7 Days", sub: "Then shipped to your state" },
  { icon: Star, title: "4.9 / 5 Rating", sub: "1,300+ happy families" },
  { icon: Gift, title: "Perfect Gift", sub: "Birthdays & festivals" },
];

export function TrustBar() {
  return (
    <section className="border-y border-brand-borderAccent bg-white">
      <div className="container-x grid grid-cols-2 gap-4 py-6 sm:grid-cols-3 lg:grid-cols-5">
        {ITEMS.map((it) => (
          <div key={it.title} className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
              <it.icon className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-deep">{it.title}</p>
              <p className="text-xs text-slate-mutedText">{it.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
