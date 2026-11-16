import { TaxAssistant } from "@/components/TaxAssistant";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const { data, error } = await db().from("documents").select("title, category, page_count, source_url").order("category");
  const documents = data ?? [];
  // Only offer category filters that actually have documents behind them.
  const categories = [...new Set(documents.map((d) => d.category as string))];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Tax Assistant</h1>
          <p className="text-sm text-slate-500">
            Answers come only from the documents listed here, with page citations. If the documents do not cover a
            question, the assistant says so. This is reference material, not tax advice.
          </p>
        </div>
        <TaxAssistant categories={categories} />
      </section>

      <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
        <h2 className="mb-3 font-semibold">Knowledge base</h2>
        {error && <p className="text-red-700">Could not load documents: {error.message}</p>}
        {!error && documents.length === 0 && (
          <p className="text-slate-500">
            No documents ingested yet. Run <code className="rounded bg-slate-100 px-1">npm run ingest</code>.
          </p>
        )}
        <ul className="space-y-3">
          {documents.map((d) => (
            <li key={d.title}>
              {d.source_url ? (
                <a href={d.source_url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                  {d.title}
                </a>
              ) : (
                d.title
              )}
              <div className="text-xs text-slate-500">
                {d.category} · {d.page_count} pages
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
