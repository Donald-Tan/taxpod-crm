import Link from "next/link";
import { db } from "@/lib/supabase";
import { OPEN_STAGES, formatRM, type ActivityEvent, type Stage } from "@/lib/types";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export default async function DashboardPage() {
  const supabase = db();
  const [contacts, opportunities, events] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("opportunities").select("stage, value_rm"),
    supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(12),
  ]);

  const error = contacts.error ?? opportunities.error ?? events.error;
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Could not load the dashboard: {error.message}. Check your Supabase settings in <code>.env.local</code> and that{" "}
        <code>supabase/schema.sql</code> has been run.
      </div>
    );
  }

  const deals = (opportunities.data ?? []) as { stage: Stage; value_rm: number }[];
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const sum = (list: typeof deals) => list.reduce((total, d) => total + Number(d.value_rm), 0);

  const tiles = [
    { label: "Total contacts", value: String(contacts.count ?? 0), href: "/contacts" },
    { label: "Open opportunities", value: String(open.length), hint: "Not yet Won or Lost", href: "/opportunities" },
    {
      label: "Total opportunities value",
      value: formatRM(sum(deals)),
      hint: `${formatRM(sum(open))} still open`,
      href: "/opportunities",
    },
  ];
  const feed = (events.data ?? []) as ActivityEvent[];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-300"
          >
            <div className="text-sm text-slate-500">{tile.label}</div>
            <div className="mt-2 text-3xl font-semibold">{tile.value}</div>
            {tile.hint && <div className="mt-1 text-xs text-slate-500">{tile.hint}</div>}
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Recent activity</h2>
        {feed.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            Nothing yet. Add a contact or an opportunity and it will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {feed.map((event) => (
              <li key={event.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    event.entity_type === "contact" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {event.entity_type}
                </span>
                <span className="flex-1">{event.summary}</span>
                <time className="text-xs text-slate-500" dateTime={event.created_at}>
                  {timeAgo(event.created_at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
