'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, BookOpen } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import StandardDossier from '@/components/StandardDossier';

function QueryDossier() {
  const searchParams = useSearchParams();
  const raw =
    searchParams?.get('is_number') ||
    searchParams?.get('id') ||
    searchParams?.get('standard') ||
    '';
  let isNumber = '';
  try {
    isNumber = decodeURIComponent(raw).trim();
  } catch {
    isNumber = raw.trim();
  }

  if (!isNumber) {
    return (
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Recommendation Engine</span>
        </Link>
        <div className="bg-white border border-slate-200 text-slate-800 p-8 rounded-xl text-center space-y-3">
          <BookOpen className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-govNavy-900">No Standard Specified</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Please search for an Indian Standard or select one from the catalog to view its compliance dossier.
          </p>
        </div>
      </div>
    );
  }
  return <StandardDossier isNumber={isNumber} />;
}

export default function StandardsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[360px] bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium">Resolving standard details across unified BIS corpus...</p>
        </div>
      }
    >
      <QueryDossier />
    </Suspense>
  );
}
