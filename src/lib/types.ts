export const CONTACT_STATUSES = ["Lead", "Prospect", "Customer"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const STAGES = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"] as const;
export type Stage = (typeof STAGES)[number];

/** Stages that still count as an open deal. */
export const OPEN_STAGES: Stage[] = ["New", "Contacted", "Qualified", "Proposal"];

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  contact_id: string;
  title: string;
  value_rm: number;
  stage: Stage;
  created_at: string;
  updated_at: string;
  contacts?: { name: string; company: string | null } | null;
}

export interface ActivityEvent {
  id: number;
  entity_type: "contact" | "opportunity";
  entity_id: string | null;
  action: string;
  summary: string;
  created_at: string;
}

export function formatRM(value: number): string {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(value);
}
