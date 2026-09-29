'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  MessageCircle,
  FileSearch,
  ShieldAlert,
  LayoutGrid,
  Columns,
  Network,
  BarChart3,
  Landmark,
  History,
  LayoutDashboard,
  ClipboardCheck,
} from 'lucide-react';

import { useLanguage } from '@/lib/i18n';

function itemClass(isActive: boolean): string {
  return `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors whitespace-nowrap ${
    isActive
      ? 'bg-blue-50 font-semibold text-blue-900 ring-1 ring-inset ring-blue-200'
      : 'font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100'
  }`;
}

export default function Sidebar() {
  const pathname = usePathname() || '/';
  const { t } = useLanguage();

  const groups = [
    {
      title: t('nav.core'),
      items: [
        { href: '/', label: t('nav.find'), icon: Search },
        { href: '/pdf-analysis', label: t('nav.pdf'), icon: FileSearch },
        { href: '/validator', label: t('nav.validator'), icon: ShieldAlert },
        { href: '/compliance', label: t('nav.compliance'), icon: ClipboardCheck },
      ],
    },
    {
      title: t('nav.explore'),
      items: [
        { href: '/browse', label: t('nav.browse'), icon: LayoutGrid },
        { href: '/compare', label: t('nav.compare'), icon: Columns },
        { href: '/graph', label: t('nav.graph'), icon: Network },
      ],
    },
    {
      title: t('nav.oversight'),
      items: [
        { href: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
        { href: '/analytics', label: t('nav.analytics'), icon: BarChart3 },
        { href: '/history', label: t('nav.history'), icon: History },
        { href: '/governance', label: t('nav.governance'), icon: Landmark },
      ],
    },
    {
      title: t('nav.assistant'),
      items: [
        { href: '/assistant', label: t('nav.chat'), icon: MessageCircle },
      ],
    },
  ];
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 shrink-0">
        <nav aria-label="Product" className="sticky top-4 card overflow-hidden p-3">
          <div className="mb-3 rounded-lg bg-gradient-to-br from-govNavy-900 to-govNavy-700 px-3 py-2.5 text-white">
            <p className="text-[11px] font-bold leading-snug">{t('nav.sidebarNote1')}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-300">{t('nav.sidebarNote2')}</p>
          </div>
          {groups.map((group, gi) => (
            <div key={group.title} className={gi > 0 ? 'mt-4 border-t border-slate-100 pt-4' : ''}>
              <p className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} className={itemClass(isActive)}>
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile / tablet horizontal nav */}
      <nav className="lg:hidden -mt-2 mb-1 flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        {groups.flatMap((g) => g.items).map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={itemClass(isActive)}>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
