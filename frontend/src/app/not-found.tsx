import Link from 'next/link';
import { SearchX, ArrowRight } from 'lucide-react';

const SHORTCUTS = [
  { href: '/', label: 'Recommendation console', desc: 'Find standards for a product or spec' },
  { href: '/browse', label: 'Browse standards', desc: '13,812 records by department and division' },
  { href: '/validator', label: 'Tender validator', desc: 'Audit pasted specifications' },
  { href: '/assistant', label: 'Standards assistant', desc: 'Grounded Q&A with citations' },
  { href: '/dashboard', label: 'Command dashboard', desc: 'KPIs, aspects, quick actions' },
];

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-10 text-center">
      <div className="card p-8 sm:p-10">
        <SearchX className="mx-auto h-12 w-12 text-slate-300" aria-hidden />
        <p className="eyebrow mt-4">Unknown address</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-govNavy-900 sm:text-2xl">
          This page doesn&apos;t exist — but nothing here is a dead end
        </h2>
        <p className="page-sub mx-auto mt-2">
          The address may be mistyped, or you followed an outdated pretty-link. Dossiers live at{' '}
          <span className="font-mono font-semibold text-slate-700">/standards?is_number=IS 1554-1</span>.
          Pick a destination below instead.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="card card-hover group flex items-center justify-between gap-2 p-3.5"
            >
              <span>
                <span className="block text-sm font-bold text-govNavy-900">{s.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{s.desc}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
