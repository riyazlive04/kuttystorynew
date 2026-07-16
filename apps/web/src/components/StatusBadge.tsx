export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-slate-100 text-slate-600",
    paid: "bg-emerald-50 text-emerald-600",
    in_production: "bg-amber-50 text-amber-600",
    shipped: "bg-indigo-50 text-indigo-600",
    delivered: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-50 text-red-600",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
        map[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
