import Link from "next/link";
import { deleteContact, saveContact } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ErrorBanner, Field, StatusBadge, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { db } from "@/lib/supabase";
import { CONTACT_STATUSES, type Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string; edit?: string; error?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { q = "", status = "", edit, error } = await searchParams;
  const supabase = db();

  let query = supabase.from("contacts").select("*").order("created_at", { ascending: false });
  if (CONTACT_STATUSES.includes(status as Contact["status"])) query = query.eq("status", status);
  const term = q.trim().replace(/[%,()]/g, " ");
  if (term) {
    // Search across name, email, phone and company.
    query = query.or(
      ["name", "email", "phone", "company"].map((column) => `${column}.ilike.%${term}%`).join(","),
    );
  }
  const { data, error: loadError } = await query;
  const contacts = (data ?? []) as Contact[];

  const editing = edit
    ? ((await supabase.from("contacts").select("*").eq("id", edit).maybeSingle()).data as Contact | null)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-slate-500">
            Every lead, prospect and customer. A contact starts as a Lead and moves up as the relationship develops.
          </p>
        </div>
      </div>

      <ErrorBanner message={error ?? loadError?.message} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <form method="get" className="flex flex-wrap gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, email, phone or company"
              aria-label="Search contacts"
              className={`${inputClass} max-w-sm`}
            />
            <select name="status" defaultValue={status} aria-label="Filter by status" className={`${inputClass} w-40`}>
              <option value="">All statuses</option>
              {CONTACT_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button className={secondaryButton}>Apply</button>
            {(q || status) && (
              <Link href="/contacts" className="self-center text-sm text-sky-700 hover:underline">
                Clear
              </Link>
            )}
          </form>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      {q || status ? "No contacts match this search." : "No contacts yet. Add the first one on the right."}
                    </td>
                  </tr>
                )}
                {contacts.map((contact) => (
                  <tr key={contact.id} className={contact.id === edit ? "bg-sky-50" : undefined}>
                    <td className="px-4 py-3 font-medium">{contact.name}</td>
                    <td className="px-4 py-3">{contact.company ?? "-"}</td>
                    <td className="px-4 py-3">{contact.email ?? "-"}</td>
                    <td className="px-4 py-3">{contact.phone ?? "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={contact.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3">
                        <Link href={`/contacts?edit=${contact.id}`} className="text-sky-700 hover:underline">
                          Edit
                        </Link>
                        <form action={deleteContact}>
                          <input type="hidden" name="id" value={contact.id} />
                          <ConfirmButton
                            className="text-red-700 hover:underline"
                            message={`Delete ${contact.name}? Their opportunities will be deleted too.`}
                          >
                            Delete
                          </ConfirmButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            {contacts.length} contact{contacts.length === 1 ? "" : "s"} shown. Deleting a contact also deletes its
            opportunities.
          </p>
        </section>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">{editing ? `Edit ${editing.name}` : "Add contact"}</h2>
          {/* `key` resets the form fields when switching between add and edit. */}
          <form action={saveContact} key={editing?.id ?? "new"} className="space-y-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name">
              <input name="name" required defaultValue={editing?.name ?? ""} className={inputClass} />
            </Field>
            <Field label="Email">
              <input name="email" type="email" defaultValue={editing?.email ?? ""} className={inputClass} />
            </Field>
            <Field label="Phone">
              <input name="phone" defaultValue={editing?.phone ?? ""} className={inputClass} />
            </Field>
            <Field label="Company">
              <input name="company" defaultValue={editing?.company ?? ""} className={inputClass} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={editing?.status ?? "Lead"} className={inputClass}>
                {CONTACT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2 pt-2">
              <button className={primaryButton}>{editing ? "Save changes" : "Add contact"}</button>
              {editing && (
                <Link href="/contacts" className={secondaryButton}>
                  Cancel
                </Link>
              )}
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
