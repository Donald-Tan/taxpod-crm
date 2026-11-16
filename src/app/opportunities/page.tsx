import Link from "next/link";
import { deleteOpportunity, saveOpportunity } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ErrorBanner, Field, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { db } from "@/lib/supabase";
import { STAGES, type Contact, type Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

type Search = { edit?: string; error?: string };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { edit, error } = await searchParams;
  const supabase = db();

  const [opportunitiesResult, contactsResult] = await Promise.all([
    supabase.from("opportunities").select("*, contacts(name, company)").order("created_at", { ascending: false }),
    supabase.from("contacts").select("id, name, company").order("name"),
  ]);
  const opportunities = (opportunitiesResult.data ?? []) as Opportunity[];
  const contacts = (contactsResult.data ?? []) as Pick<Contact, "id" | "name" | "company">[];
  const editing = edit ? (opportunities.find((o) => o.id === edit) ?? null) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <p className="text-sm text-slate-500">Drag a card to another column, or use its stage dropdown, to move a deal.</p>
      </div>

      <ErrorBanner message={error ?? opportunitiesResult.error?.message ?? contactsResult.error?.message} />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">{editing ? `Edit "${editing.title}"` : "Add opportunity"}</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-slate-500">
            An opportunity must belong to a contact.{" "}
            <Link href="/contacts" className="text-sky-700 hover:underline">
              Add a contact first.
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <form
              action={saveOpportunity}
              key={editing?.id ?? "new"}
              className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr_auto] lg:items-end"
            >
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Title">
                <input name="title" required defaultValue={editing?.title ?? ""} className={inputClass} />
              </Field>
              <Field label="Contact">
                <select name="contact_id" required defaultValue={editing?.contact_id ?? ""} className={inputClass}>
                  <option value="" disabled>
                    Choose a contact
                  </option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` (${c.company})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Value (RM)">
                <input
                  name="value_rm"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={editing ? Number(editing.value_rm) : ""}
                  className={inputClass}
                />
              </Field>
              <Field label="Stage">
                <select name="stage" defaultValue={editing?.stage ?? "New"} className={inputClass}>
                  {STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <div className="flex gap-2">
                <button className={primaryButton}>{editing ? "Save" : "Add"}</button>
                {editing && (
                  <Link href="/opportunities" className={secondaryButton}>
                    Cancel
                  </Link>
                )}
              </div>
            </form>
            {editing && (
              <form action={deleteOpportunity}>
                <input type="hidden" name="id" value={editing.id} />
                <ConfirmButton
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  message={`Delete "${editing.title}"?`}
                >
                  Delete
                </ConfirmButton>
              </form>
            )}
          </div>
        )}
      </section>

      <KanbanBoard opportunities={opportunities} />
    </div>
  );
}
