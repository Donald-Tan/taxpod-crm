import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "taxPOD CRM",
  description: "Lightweight CRM with a Malaysian tax document assistant (RAG)",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/assistant", label: "Tax Assistant" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
            <Link href="/" className="text-lg font-semibold text-sky-700">
              taxPOD CRM
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto text-xs text-slate-500">Signed in as Demo User</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
