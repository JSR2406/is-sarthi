'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, FileSearch, ListChecks, BellRing, Link2, Ban } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const CHECKS = [
  {
    icon: Ban,
    title: 'Withdrawn & superseded citations',
    body: 'Flags standards like IS 8112 that were consolidated into IS 269, with the replacement to cite.',
  },
  {
    icon: BellRing,
    title: 'Mandatory certification warnings',
    body: 'Surfaces ISI / CRS / Hallmarking QCO obligations missing from tender submission criteria.',
  },
  {
    icon: Link2,
    title: 'Missing allied standards',
    body: 'Suggests normative test methods, safety codes, and installation practices your spec omits.',
  },
  {
    icon: ListChecks,
    title: 'Review-window lapses',
    body: 'Notes standards past their valid_upto date pending BIS reaffirmation or revision.',
  },
];

export default function CompliancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldAlert}
        eyebrow="Start here"
        title="Compliance Check"
        description="Start here to audit a draft tender before publication. Pick the entry point that matches what you have — pasted text or a full document."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/validator"
          className="bg-govNavy-900 hover:bg-govNavy-800 text-white rounded-xl p-5 shadow transition-colors group"
        >
          <ShieldAlert className="w-6 h-6 text-govSaffron-500" />
          <h3 className="font-bold mt-2 group-hover:underline">Audit pasted text →</h3>
          <p className="text-xs text-slate-300 mt-1">
            Paste specification clauses. Citations are extracted, currency-checked, and mapped to
            replacements and missing allied standards.
          </p>
        </Link>
        <Link
          href="/pdf-analysis"
          className="bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-400 rounded-xl p-5 shadow-sm transition-colors group"
        >
          <FileSearch className="w-6 h-6 text-blue-600" />
          <h3 className="font-bold mt-2 text-govNavy-900 group-hover:underline">Audit a document →</h3>
          <p className="text-xs text-slate-500 mt-1">
            Upload a PDF, DOCX, or TXT tender. Text is extracted and the same audit runs automatically.
          </p>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-govNavy-900 mb-3">What every check covers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CHECKS.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="flex gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
                <Icon className="w-5 h-5 text-govSaffron-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-slate-800">{c.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{c.body}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Audits run against the same unified corpus as recommendations — cited numbers resolve
          through canonical matching, so “IS 1554 (Part 1)” and “IS 1554-1” are treated as one standard.
        </p>
      </div>
    </div>
  );
}
