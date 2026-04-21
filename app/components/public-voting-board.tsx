'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CategoryCarousel from './category-carousel';
import {
  buildVotingOptionStats,
  getCategoryLabel,
  getDisplayedOdd,
  getParsedOptions,
  getVotingPrimaryImage,
  getVotingStatus,
  parsePollMetadata,
  type BetCountsMap,
  type CategoryValue,
  type VotingRecord,
} from '../utils/voting-market';

type PublicVotingBoardProps = {
  initialSelectedCategory: CategoryValue;
  votacoes: VotingRecord[];
  categories: Array<{
    value: CategoryValue;
    label: string;
  }>;
};

export default function PublicVotingBoard({
  initialSelectedCategory,
  votacoes,
  categories,
}: PublicVotingBoardProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue>(initialSelectedCategory);
  const [betCounts, setBetCounts] = useState<BetCountsMap>({});
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const loadBetCounts = async () => {
      try {
        const response = await fetch('/api/votacoes/bet-counts', { method: 'GET', cache: 'no-store' });
        const payload = (await response.json()) as { counts?: BetCountsMap };
        setBetCounts(payload.counts || {});
      } catch {
        setBetCounts({});
      }
    };

    void loadBetCounts();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const filteredVotacoes = useMemo(() => {
    return votacoes
      .filter((votacao) => {
        const metadata = parsePollMetadata(votacao.descricao);

        if (selectedCategory === 'todos') return true;
        return metadata.categoria === selectedCategory;
      })
      .sort((left, right) => {
        const leftStatus = getVotingStatus(left, nowTimestamp);
        const rightStatus = getVotingStatus(right, nowTimestamp);

        if (leftStatus.isClosed !== rightStatus.isClosed) {
          return leftStatus.isClosed ? 1 : -1;
        }

        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });
  }, [nowTimestamp, selectedCategory, votacoes]);

  const updateCategory = (value: CategoryValue) => {
    setSelectedCategory(value);
    const nextUrl = value === 'todos' ? pathname : `${pathname}?category=${value}`;
    router.replace(nextUrl, { scroll: false });
  };

  const currentQuery = searchParams?.toString();

  return (
    <>
      <div className="mb-6">
        <CategoryCarousel
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={(value) => updateCategory(value as CategoryValue)}
          basePath={pathname}
          variant="dark"
        />
      </div>

      {filteredVotacoes.length === 0 ? (
        <div className="text-cyan-200 text-center py-8 rounded-xl bg-cyan-900/30 border border-cyan-700">
          <p>
            {selectedCategory === 'todos'
              ? 'Nenhuma votação disponível no momento. Volte em breve!'
              : `Nenhuma votação encontrada na categoria ${getCategoryLabel(selectedCategory)}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-4 pb-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 lg:pb-12">
          {filteredVotacoes.map((votacao) => {
            const metadata = parsePollMetadata(votacao.descricao);
            const status = getVotingStatus(votacao, nowTimestamp);
            const optionStats = buildVotingOptionStats(votacao, betCounts).slice(0, 3);
            const avatarImage = getVotingPrimaryImage(votacao);
            const fallbackInitial = getParsedOptions(votacao)[0]?.label?.slice(0, 1).toUpperCase() || '?';

            return (
              <Link
                key={votacao.id}
                href={`/mercados/${votacao.id}${currentQuery ? `?${currentQuery}` : ''}`}
                prefetch={false}
                className="group flex h-full min-h-[280px] flex-col rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,24,31,0.98)_0%,rgba(11,14,20,0.98)_100%)] p-4 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.9)] transition duration-200 hover:-translate-y-1 hover:border-cyan-400/35 hover:shadow-[0_30px_80px_-42px_rgba(6,182,212,0.4)]"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-300">
                    {getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
                      status.tone === 'closed'
                        ? 'bg-white/[0.05] text-zinc-400'
                        : 'bg-red-600 text-white shadow-[0_10px_24px_-12px_rgba(220,38,38,0.9)]'
                    }`}
                  >
                    {!status.isClosed && (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                      </span>
                    )}
                    {status.label}
                  </span>
                </div>

                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117] shadow-inner shadow-black/30">
                    {avatarImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarImage} alt={votacao.titulo} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-white">{fallbackInitial}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold leading-6 text-white [display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {votacao.titulo}
                  </h3>
                </div>

                <div className="flex-1 space-y-2.5">
                  {optionStats.length > 0 ? (
                    optionStats.map((option, index) => {
                      const optionInitial = option.label.slice(0, 1).toUpperCase() || '?';

                      return (
                        <div
                          key={`${votacao.id}-${option.label || index}`}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1a1f28]">
                                {option.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={option.imageUrl}
                                    alt={option.label || `Opção ${index + 1}`}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-xs font-semibold text-white">{optionInitial}</span>
                                )}
                              </div>
                              <span className="truncate text-sm font-medium text-zinc-100">
                                {option.label || `Opção ${index + 1}`}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="rounded-full bg-cyan-500/12 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
                                {getDisplayedOdd(option.odds)}
                              </span>
                              <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-white">
                                {option.percent}%
                              </span>
                            </div>
                          </div>
                          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/30">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400"
                              style={{ width: `${option.percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-2xl border border-white/10 bg-[#11151b] px-3 py-3 text-xs text-zinc-400">
                      Nenhuma opção disponível para esta votação no momento.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-xs text-zinc-400">{status.footerLabel}</span>
                  <span className="text-xs font-semibold text-cyan-300 transition group-hover:text-cyan-200">
                    Abrir mercado
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
