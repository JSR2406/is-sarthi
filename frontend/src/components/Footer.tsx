'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n';

export default function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-slate-200 bg-white/80 py-5 text-xs text-slate-500 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6 lg:px-8">
        <p>
          <strong className="text-govNavy-900">IS Sarthi (मानक सारथी)</strong> — {t('footer.tag')}
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/browse" className="link !text-xs !font-normal">{t('nav.browse')}</Link>
          <Link href="/compare" className="link !text-xs !font-normal">{t('nav.compare')}</Link>
          <Link href="/validator" className="link !text-xs !font-normal">{t('nav.validator')}</Link>
          <Link href="/analytics" className="link !text-xs !font-normal">{t('nav.analytics')}</Link>
          <Link href="/governance" className="link !text-xs !font-normal">{t('nav.governance')}</Link>
        </nav>
        <p className="text-slate-400">{t('footer.demo')}</p>
      </div>
    </footer>
  );
}
