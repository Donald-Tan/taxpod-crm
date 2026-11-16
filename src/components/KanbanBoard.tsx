"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveOpportunity } from "@/app/actions";
import { STAGES, formatRM, type Opportunity, type Stage } from "@/lib/types";

const COLUMN_COLOURS: Record<Stage, string> = {
  New: "border-t-slate-400",
  Contacted: "border-t-sky-400",
  Qualified: "border-t-indigo-400",
  Proposal: "border-t-amber-400",
  Won: "border-t-emerald-500",
  Lost: "border-t-red-400",
};

/**
 * Kanban board grouped by stage. Cards move by drag and drop, or with the
 * stage dropdown on each card (keyboard and touch friendly). Moves are applied
 * optimistically and rolled back by the server re-render if the save fails.
 */
export function KanbanBoard({ opportunities }: { opportunities: Opportunity[] }) {
  const [items, moveOptimistic] = useOptimistic(
    opportunities,
    (current, move: { id: string; stage: Stage }) =>
      current.map((o) => (o.id === move.id ? { ...o, stage: move.stage } : o)),
  );
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  function move(id: string, stage: Stage) {
    const current = items.find((o) => o.id === id);
    if (!current || current.stage === stage) return;
    setError(null);
    startTransition(async () => {
      moveOptimistic({ id, stage });
      const result = await moveOpportunity(id, stage);
      if (!result.ok) setError(result.error ?? "Could not move the opportunity.");
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const cards = items.filter((o) => o.stage === stage);
          const total = cards.reduce((sum, o) => sum + Number(o.value_rm), 0);
          return (
            <section
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                move(e.dataTransfer.getData("text/plain"), stage);
              }}
              className={`min-h-48 rounded-xl border border-t-4 border-slate-200 bg-white p-3 shadow-sm ${COLUMN_COLOURS[stage]} ${
                dragOver === stage ? "ring-2 ring-sky-400" : ""
              }`}
            >
              <header className="mb-3">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{stage}</span>
                  <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-600">{cards.length}</span>
                </div>
                <div className="text-xs text-slate-500">{formatRM(total)}</div>
              </header>
              <ul className="space-y-2">
                {cards.map((o) => (
                  <li
                    key={o.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", o.id)}
                    className="cursor-grab rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm active:cursor-grabbing"
                  >
                    <div className="font-medium">{o.title}</div>
                    <div className="text-xs text-slate-600">
                      {o.contacts?.name ?? "Unknown contact"}
                      {o.contacts?.company ? `, ${o.contacts.company}` : ""}
                    </div>
                    <div className="mt-1 font-semibold">{formatRM(Number(o.value_rm))}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        aria-label={`Stage for ${o.title}`}
                        value={o.stage}
                        onChange={(e) => move(o.id, e.target.value as Stage)}
                        className="flex-1 rounded border border-slate-300 bg-white px-1 py-1 text-xs"
                      >
                        {STAGES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <Link href={`/opportunities?edit=${o.id}`} className="text-xs text-sky-700 hover:underline">
                        Edit
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
