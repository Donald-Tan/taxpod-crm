/** Small shared presentational helpers (server-safe, no client JS). */

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500";

export const primaryButton =
  "rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50";

export const secondaryButton =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

const STATUS_COLOURS: Record<string, string> = {
  Lead: "bg-amber-100 text-amber-800",
  Prospect: "bg-sky-100 text-sky-800",
  Customer: "bg-emerald-100 text-emerald-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[status] ?? "bg-slate-100"}`}>
      {status}
    </span>
  );
}
