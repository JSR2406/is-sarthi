'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, ShieldAlert, Network, BarChart3, Radio, MessageCircle } from 'lucide-react';
import { fetchHealth, fetchDivisions } from '@/lib/api';
import { useLanguage, LANGUAGES, Lang } from '@/lib/i18n';

export default function Navbar() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const [telemetry, setTelemetry] = useState<{ status: string; standards_indexed: number; voice_enabled: boolean } | null>(null);
  const [unifiedTotal, setUnifiedTotal] = useState<number | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setTelemetry)
      .catch(() => setTelemetry(null));
    fetchDivisions()
      .then((res) => setUnifiedTotal(res.total))
      .catch(() => setUnifiedTotal(null));
  }, []);

  const navItems = [
    { href: '/', label: t('nav.find'), icon: Search },
    { href: '/assistant', label: t('nav.chat'), icon: MessageCircle },
    { href: '/validator', label: t('nav.validator'), icon: ShieldAlert },
    { href: '/graph', label: t('nav.graph'), icon: Network },
    { href: '/analytics', label: t('nav.analytics'), icon: BarChart3 },
  ];

  return (
    <header className="w-full bg-gradient-to-b from-govNavy-950 to-govNavy-900 text-white shadow-lift">
      {/* Brand bar */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 p-1 shadow-inner ring-1 ring-white/10">
              <img
                src="/assets/logo.png"
                alt="IS Sarthi Logo"
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Emblem_of_India.svg/200px-Emblem_of_India.svg.png';
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  IS Sarthi <span className="font-medium text-govSaffron-500">| मानक सारथी</span>
                </h1>
                <span className="hidden rounded border border-govSaffron-500/40 bg-govSaffron-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-govSaffron-500 sm:inline-block">
                  GovTech
                </span>
              </div>
              <p className="truncate text-xs text-slate-300">
                Bureau of Indian Standards (BIS) Recommendation & Compliance Engine
              </p>
            </div>
          </div>

          {/* Telemetry + language */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="lang-select">Language</label>
            <select
              id="lang-select"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-govSaffron-500 [&>option]:text-slate-900"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs text-slate-200 backdrop-blur-sm scrollbar-none">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span>
                <strong>{unifiedTotal !== null ? unifiedTotal.toLocaleString() : telemetry?.standards_indexed !== undefined ? telemetry.standards_indexed : '—'}</strong> {t('brand.indexed')}
              </span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1 text-govSaffron-500">
                <Radio className="w-3 h-3 animate-pulse" />
                <span>{t('brand.ai')}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabbed Navigation */}
      <nav className="border-t border-white/10 bg-govNavy-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="scrollbar-none flex gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-govSaffron-500' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-govSaffron-500" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </header>
  );
}
