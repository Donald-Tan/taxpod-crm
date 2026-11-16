/**
 * The knowledge base manifest. All documents are public PDFs published by the
 * Inland Revenue Board of Malaysia (LHDN / IRBM) on hasil.gov.my.
 *
 * To add a document (for example an SST guide from mysst.customs.gov.my):
 *   1. add an entry below with a unique slug and a category,
 *   2. either give its `url`, or save the PDF yourself as data/docs/<slug>.pdf,
 *   3. run `npm run ingest -- --only <slug>`.
 */
export interface SourceDocument {
  slug: string;
  title: string;
  category: "e-Invoice" | "Income Tax" | "SST";
  url?: string;
}

export const DOCUMENTS: SourceDocument[] = [
  {
    slug: "e-invoice-guideline",
    title: "IRBM e-Invoice Guideline",
    category: "e-Invoice",
    url: "https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Guideline.pdf",
  },
  {
    slug: "e-invoice-specific-guideline",
    title: "IRBM e-Invoice Specific Guideline",
    category: "e-Invoice",
    url: "https://www.hasil.gov.my/wp-content/uploads/irbm-e-invoice-specific-guideline.pdf",
  },
  {
    slug: "e-invoice-general-faqs",
    title: "LHDNM e-Invoice General FAQs",
    category: "e-Invoice",
    url: "https://www.hasil.gov.my/wp-content/uploads/lhdnm-e-invoice-general-faqs.pdf",
  },
  {
    slug: "pr-4-2024-resident-individual",
    title: "Public Ruling No. 4/2024: Taxation of a Resident Individual",
    category: "Income Tax",
    url: "https://www.hasil.gov.my/wp-content/uploads/pr-no-4-2024.pdf",
  },
  {
    slug: "pr-2-2025-group-relief",
    title: "Public Ruling No. 2/2025: Group Relief for Companies",
    category: "Income Tax",
    url: "https://www.hasil.gov.my/wp-content/uploads/pr-2-2025-group-relief-for-companies.pdf",
  },
  {
    slug: "pr-1-2025-malaysian-ship",
    title: "Public Ruling No. 1/2025: Tax Treatment of Malaysian Ship",
    category: "Income Tax",
    url: "https://www.hasil.gov.my/wp-content/uploads/pr-1_2025-tax-treatment-of-malaysian-ship.pdf",
  },
  {
    slug: "pr-pre-operational-expenditure",
    title: "Public Ruling: Pre-Operational Business Expenditure",
    category: "Income Tax",
    url: "https://www.hasil.gov.my/wp-content/uploads/public-ruling-pre-operational-bussiness-expenditure.pdf",
  },
];
