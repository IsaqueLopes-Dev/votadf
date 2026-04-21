'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabaseClient';

type SiteHeaderProps = {
  loggedInHomeHref?: string;
};

export default function SiteHeader({ loggedInHomeHref = '/home' }: SiteHeaderProps) {
  const [user, setUser] = useState<User | null>(null);
  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setUser(session?.user ?? null);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const rawBalance = user?.user_metadata?.balance ?? user?.user_metadata?.saldo ?? 0;
  const parsedBalance = typeof rawBalance === 'number' ? rawBalance : Number(String(rawBalance).replace(',', '.'));
  const formattedUserBalance = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(parsedBalance) ? parsedBalance : 0);
  const avatarUrl = String(user?.user_metadata?.avatar_url || '').trim();
  const username =
    String(user?.user_metadata?.username || '').trim() ||
    (user?.email ? `@${user.email.split('@')[0]}` : '@usuario');
  const avatarInitial = username.replace('@', '').slice(0, 1).toUpperCase() || 'U';

  return (
    <header
      className="sticky top-0 z-30 border-b border-blue-500/40 bg-blue-600/95 shadow-md backdrop-blur"
      style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
    >
      <div
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-10 sm:py-4"
        style={{ maxWidth: 1200, margin: '0 auto' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Logo VP"
            style={{ height: 36, width: 36, objectFit: 'contain', marginRight: 8 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
            <span
              className="text-xl sm:text-2xl font-bold text-white shrink-0 tracking-tight"
              style={{ fontFamily: 'inherit', marginBottom: -8, letterSpacing: 0 }}
            >
              Votaai
            </span>
            <span
              className="text-xs sm:text-sm font-medium text-cyan-200"
              style={{ marginTop: 0, fontFamily: 'inherit', textAlign: 'center' }}
            >
              Previsão
            </span>
          </div>
        </div>

        <div className="relative flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-nowrap sm:gap-3 min-w-0">
          {user ? (
            <>
              <Link
                href={loggedInHomeHref}
                className="flex min-w-0 flex-none items-center gap-1.5 rounded-full border border-white/15 bg-white/12 px-2.5 py-1.5 shadow-[0_10px_24px_-16px_rgba(15,23,42,0.65)] transition hover:bg-white/20 sm:flex-none sm:gap-2 sm:px-4 sm:py-2"
              >
                <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-white/12 sm:flex">
                  <svg className="h-3.5 w-3.5 text-blue-100" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path
                      fillRule="evenodd"
                      d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span className="text-left leading-none">
                  <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100/75">Saldo</span>
                  <span className="text-[11px] sm:text-sm font-semibold text-white">{formattedUserBalance}</span>
                </span>
              </Link>

              <Link
                href="/home?deposit=1"
                className="flex-none rounded-full bg-white px-2.5 py-1.5 text-[11px] font-bold text-blue-600 shadow-sm transition hover:bg-blue-50 active:scale-95 sm:flex-none sm:px-4 sm:py-2 sm:text-sm shrink-0"
              >
                Depositar
              </Link>

              <Link
                href="/home/historico"
                className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-blue-500 text-white shadow-sm transition hover:border-white/80"
                title="Histórico de apostas"
                aria-label="Histórico de apostas"
              >
                <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.5A2.5 2.5 0 017 4h10a2.5 2.5 0 012.5 2.5v11A2.5 2.5 0 0117 20H7a2.5 2.5 0 01-2.5-2.5v-11z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 4v16" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 8h5M11 11h5M11 14h4" />
                </svg>
              </Link>

              <Link
                href={loggedInHomeHref}
                className="h-9 w-9 sm:h-10 sm:w-10 overflow-hidden rounded-full border-2 border-white/40 bg-blue-500 shadow-sm transition hover:border-white/80"
                title="Perfil"
                aria-label="Perfil"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={username} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
                    {avatarInitial}
                  </div>
                )}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login?next=%2Fhome%3Fdeposit%3D1"
                className="flex-1 rounded-full bg-white px-3 py-2 text-center text-xs font-bold text-blue-600 shadow-[0_6px_16px_-8px_rgba(30,64,175,0.65)] transition hover:-translate-y-0.5 hover:bg-blue-50 sm:flex-none sm:px-4 sm:py-2 sm:text-sm"
              >
                Depositar
              </Link>
              <Link
                href="/login"
                className="flex-1 rounded-full border border-white/40 bg-white/15 px-3 py-2 text-center text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20 sm:flex-none sm:px-4 sm:py-2 sm:text-sm"
              >
                Criar conta ou fazer login
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
