"use server";

/**
 * All CRM writes go through these server actions. Each one validates its
 * input, writes to Postgres, and records an activity event for the dashboard.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { CONTACT_STATUSES, STAGES, formatRM, type ContactStatus, type Stage } from "@/lib/types";

async function logActivity(
  entityType: "contact" | "opportunity",
  entityId: string | null,
  action: string,
  summary: string,
) {
  // The activity feed is secondary: never fail the user's action because of it.
  const { error } = await db()
    .from("activity_events")
    .insert({ entity_type: entityType, entity_id: entityId, action, summary });
  if (error) console.error("[activity] failed to log event:", error.message);
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/opportunities");
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function saveContact(form: FormData) {
  const id = text(form, "id");
  const name = text(form, "name");
  const email = text(form, "email");
  const status = text(form, "status") as ContactStatus;
  const back = id ? `/contacts?edit=${id}` : "/contacts";

  if (!name) fail(back, "Name is required.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(back, "Email address is not valid.");
  if (!CONTACT_STATUSES.includes(status)) fail(back, "Status is not valid.");

  const values = {
    name,
    email: email || null,
    phone: text(form, "phone") || null,
    company: text(form, "company") || null,
    status,
  };

  if (id) {
    const { data: before } = await db().from("contacts").select("status").eq("id", id).maybeSingle();
    const { error } = await db()
      .from("contacts")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) fail(back, error.message);
    const statusChange = before && before.status !== status ? ` (status ${before.status} → ${status})` : "";
    await logActivity("contact", id, "updated", `Contact "${name}" updated${statusChange}`);
  } else {
    const { data, error } = await db().from("contacts").insert(values).select("id").single();
    if (error) fail(back, error.message);
    await logActivity("contact", data!.id, "created", `Contact "${name}" added as ${status}`);
  }

  refresh();
  redirect("/contacts");
}

export async function deleteContact(form: FormData) {
  const id = text(form, "id");
  const { data: contact } = await db().from("contacts").select("name").eq("id", id).maybeSingle();
  const { error } = await db().from("contacts").delete().eq("id", id);
  if (error) fail("/contacts", error.message);
  await logActivity("contact", null, "deleted", `Contact "${contact?.name ?? id}" deleted`);
  refresh();
  redirect("/contacts");
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export async function saveOpportunity(form: FormData) {
  const id = text(form, "id");
  const title = text(form, "title");
  const contactId = text(form, "contact_id");
  const stage = text(form, "stage") as Stage;
  const value = Number(text(form, "value_rm"));
  const back = id ? `/opportunities?edit=${id}` : "/opportunities";

  if (!title) fail(back, "Title is required.");
  if (!contactId) fail(back, "Choose a contact for this opportunity.");
  if (!Number.isFinite(value) || value < 0) fail(back, "Value (RM) must be zero or more.");
  if (!STAGES.includes(stage)) fail(back, "Stage is not valid.");

  const values = { title, contact_id: contactId, value_rm: value, stage };

  if (id) {
    const { error } = await db()
      .from("opportunities")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) fail(back, error.message);
    await logActivity("opportunity", id, "updated", `Opportunity "${title}" updated (${formatRM(value)}, ${stage})`);
  } else {
    const { data, error } = await db().from("opportunities").insert(values).select("id").single();
    if (error) fail(back, error.message);
    await logActivity("opportunity", data!.id, "created", `Opportunity "${title}" created (${formatRM(value)}, ${stage})`);
  }

  refresh();
  redirect("/opportunities");
}

/** Called by the Kanban board when a card is dropped on another column. */
export async function moveOpportunity(id: string, stage: Stage): Promise<{ ok: boolean; error?: string }> {
  if (!STAGES.includes(stage)) return { ok: false, error: "Stage is not valid." };

  const { data: before, error: readError } = await db()
    .from("opportunities")
    .select("title, stage")
    .eq("id", id)
    .maybeSingle();
  if (readError || !before) return { ok: false, error: readError?.message ?? "Opportunity not found." };
  if (before.stage === stage) return { ok: true };

  const { error } = await db()
    .from("opportunities")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logActivity("opportunity", id, "stage_changed", `Opportunity "${before.title}" moved ${before.stage} → ${stage}`);
  refresh();
  return { ok: true };
}

export async function deleteOpportunity(form: FormData) {
  const id = text(form, "id");
  const { data: opportunity } = await db().from("opportunities").select("title").eq("id", id).maybeSingle();
  const { error } = await db().from("opportunities").delete().eq("id", id);
  if (error) fail("/opportunities", error.message);
  await logActivity("opportunity", null, "deleted", `Opportunity "${opportunity?.title ?? id}" deleted`);
  refresh();
  redirect("/opportunities");
}
