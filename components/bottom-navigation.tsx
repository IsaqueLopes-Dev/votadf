'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    href: '/mercados',
    label: 'Mercados',
    matches: (pathname: string) => pathname === '/mercados' || pathname.startsWith('/home'),
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 19h18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 15l3-3 3 2 5-6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 10v5M10 8v4M13 11v3M18 5v9" />
      </svg>
    ),
  },
  {
    href: '/chat',
    label: 'Chat',
    matches: (pathname: string) => pathname === '/chat',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 19l-2 2V6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H8l-2 2z" />
      </svg>
    ),
  },
] as const;

export default function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/8 bg-[#0f0f0f]/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex h-[68px] w-full max-w-3xl items-center justify-around px-4">
        {navItems.map((item) => {
          const isActive = item.matches(pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex min-w-[96px] flex-col items-center justify-center gap-1 rounded-2xl px-4 py-2 transition duration-200 active:scale-95 ${
                isActive ? 'text-blue-500' : 'text-[#888888] hover:text-slate-300'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                {item.icon}
              </span>
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase">{item.label}</span>
              <span className={`h-1 w-8 rounded-full transition ${isActive ? 'bg-blue-500' : 'bg-transparent'}`} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
