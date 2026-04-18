'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createClient, type User } from '@supabase/supabase-js';
import CategoryCarousel from './category-carousel';

const META_PREFIX = '__meta__:';

type CategoryValue = 'todos' | 'politica' | 'entretenimento' | 'futebol';
type PollType = 'opcoes-livres' | 'enquete-candidatos';
type PollCategory = 'politica' | 'entretenimento' | 'futebol' | '';

type CategoryOption = {
  value: CategoryValue;
  label: string;
};

type PollOption = {
  label: string;
  imageUrl: string;
  odds: string;
  oddsNao: string;
};

type VotingRecord = {
  id: string;
  titulo: string;
  descricao: string;
  opcoes: string[];
  ativa: boolean;
  created_at: string;
};

type BetCountsMap = Record<string, Record<string, number>>;

type BetModalState = {
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  imageUrl: string;
};

type PublicVotingBoardProps = {
  initialSelectedCategory: CategoryValue;
  votacoes: VotingRecord[];
  categories: CategoryOption[];
};

const parsePollMetadata = (descricao: string | null | undefined) => {
  const rawDescription = descricao || '';

  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
    const cleanDescription = lineBreakIndex === -1 ? '' : rawDescription.slice(lineBreakIndex + 1);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, '')) as {
        tipo?: PollType;
        categoria?: PollCategory;
        encerramentoAposta?: string;
        bettingClosesAt?: string;
      };

      return {
        tipo: parsed.tipo === 'enquete-candidatos' ? 'enquete-candidatos' : 'opcoes-livres',
        categoria:
          parsed.categoria === 'politica' || parsed.categoria === 'entretenimento' || parsed.categoria === 'futebol'
            ? parsed.categoria
            : '',
        encerramentoAposta: String(parsed.encerramentoAposta || parsed.bettingClosesAt || '').trim(),
        descricaoLimpa: cleanDescription,
      };
    } catch {
      return {
        tipo: 'opcoes-livres' as const,
        categoria: '' as PollCategory,
        encerramentoAposta: '',
        descricaoLimpa: cleanDescription,
      };
    }
  }

  return {
    tipo: 'opcoes-livres' as const,
    categoria: '' as PollCategory,
    encerramentoAposta: '',
    descricaoLimpa: rawDescription,
  };
};

const parsePollOption = (option: unknown): PollOption => {
  if (typeof option !== 'string') {
    return { label: '', imageUrl: '', odds: '', oddsNao: '' };
  }

  try {
    const parsed = JSON.parse(option) as Partial<
      PollOption & { odds: number | null; oddsNao: number | null; image_url: string; image: string; avatarUrl: string }
    >;

    if (typeof parsed.label === 'string') {
      return {
        label: parsed.label,
        imageUrl:
          typeof parsed.imageUrl === 'string'
            ? parsed.imageUrl
            : typeof parsed.image_url === 'string'
              ? parsed.image_url
              : typeof parsed.image === 'string'
                ? parsed.image
                : typeof parsed.avatarUrl === 'string'
                  ? parsed.avatarUrl
                  : '',
        odds: parsed.odds != null && Number.isFinite(Number(parsed.odds)) ? String(parsed.odds) : '',
        oddsNao: parsed.oddsNao != null && Number.isFinite(Number(parsed.oddsNao)) ? String(parsed.oddsNao) : '',
      };
    }
  } catch {
    // Compatibilidade com opções em texto puro.
  }

  return {
    label: option,
    imageUrl: '',
    odds: '',
    oddsNao: '',
  };
};

const getDeterministicHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const normalizeCandidate = (value: string) => value.trim().toLowerCase();

const getSimulatedBaseBets = (votacaoId: string, option: PollOption, index: number) => {
  const hash = getDeterministicHash(`${votacaoId}:${option.label}:${index}:base`);
  return 18 + (hash % 73);
};

const getRealBetCount = (counts: BetCountsMap, votacaoId: string, candidateLabel: string) => {
  return counts[votacaoId]?.[normalizeCandidate(candidateLabel)] || 0;
};

export default function PublicVotingBoard({
  initialSelectedCategory,
  votacoes,
  categories,
}: PublicVotingBoardProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue>(initialSelectedCategory);
  const [betCounts, setBetCounts] = useState<BetCountsMap>({});
  const [betModal, setBetModal] = useState<BetModalState | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [placingBet, setPlacingBet] = useState(false);
  const [betFeedback, setBetFeedback] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  useEffect(() => {
    const loadUser = async () => {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        setUser(currentUser);
      } finally {
        setLoadingUser(false);
      }
    };

    void loadUser();
  }, [supabase]);

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

  const filteredVotacoes = useMemo(() => {
    return votacoes.filter((votacao) => {
      if (selectedCategory === 'todos') return true;
      return parsePollMetadata(votacao.descricao).categoria === selectedCategory;
    });
  }, [selectedCategory, votacoes]);

  const rawBalance = user?.user_metadata?.balance ?? user?.user_metadata?.saldo ?? 0;
  const parsedBalance = typeof rawBalance === 'number' ? rawBalance : Number(String(rawBalance).replace(',', '.'));
  const userBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
  const formattedUserBalance = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(userBalance);

  const parsedBetAmount = Number(betAmount.replace(',', '.'));
  const potentialReturn = Number.isFinite(parsedBetAmount) && parsedBetAmount > 0 && betModal
    ? parsedBetAmount * betModal.odd
    : 0;
  const potentialProfit = Number.isFinite(parsedBetAmount) && parsedBetAmount > 0
    ? Math.max(potentialReturn - parsedBetAmount, 0)
    : 0;

  const updateCategory = (value: CategoryValue) => {
    setSelectedCategory(value);
    const nextUrl = value === 'todos' ? pathname : `${pathname}?category=${value}`;
    router.replace(nextUrl, { scroll: false });
  };

  const buildCurrentUrl = () => {
    const currentQuery = searchParams?.toString();
    return currentQuery ? `${pathname}?${currentQuery}` : pathname;
  };

  const openBetModal = (votacao: VotingRecord, option: PollOption) => {
    const metadata = parsePollMetadata(votacao.descricao);
    const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
    const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();
    if (isBetClosed) {
      alert('O prazo para apostar nesta votação já foi encerrado.');
      return;
    }

    const odd = Number(option.odds || 0);
    if (!Number.isFinite(odd) || odd <= 0) {
      alert('Esta opção ainda não possui odd configurada.');
      return;
    }

    setBetModal({
      votacaoId: votacao.id,
      votacaoTitulo: votacao.titulo,
      candidato: option.label,
      odd,
      imageUrl: option.imageUrl,
    });
    setBetAmount('');
    setBetFeedback(null);
  };

  const handlePlaceBet = async () => {
    if (!betModal) return;

    if (!user) {
      router.push(`/login?next=${encodeURIComponent(buildCurrentUrl())}`);
      return;
    }

    const amount = Number(betAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBetFeedback('Digite um valor válido para apostar.');
      return;
    }

    if (!Number.isFinite(userBalance) || amount > userBalance) {
      setBetFeedback('Saldo insuficiente para essa aposta.');
      return;
    }

    setPlacingBet(true);
    setBetFeedback(null);

    try {
      const existingBets = Array.isArray(user.user_metadata?.bets) ? user.user_metadata.bets : [];
      const nextBalance = Math.round((userBalance - amount) * 100) / 100;
      const nextBets = [
        ...existingBets,
        {
          id: crypto.randomUUID(),
          votacaoId: betModal.votacaoId,
          votacaoTitulo: betModal.votacaoTitulo,
          candidato: betModal.candidato,
          odd: betModal.odd,
          amount,
          potentialReturn: Math.round(amount * betModal.odd * 100) / 100,
          createdAt: new Date().toISOString(),
        },
      ];

      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          balance: nextBalance,
          bets: nextBets,
        },
      });

      if (error) {
        setBetFeedback(`Erro ao registrar aposta: ${error.message}`);
        return;
      }

      if (data.user) {
        setUser(data.user);
      }

      try {
        const response = await fetch('/api/votacoes/bet-counts', { method: 'GET', cache: 'no-store' });
        const payload = (await response.json()) as { counts?: BetCountsMap };
        setBetCounts(payload.counts || {});
      } catch {
        setBetCounts((current) => current);
      }

      setBetFeedback('Aposta registrada com sucesso.');
      setTimeout(() => {
        setBetModal(null);
        setBetAmount('');
        setBetFeedback(null);
      }, 900);
    } catch {
      setBetFeedback('Erro ao registrar aposta. Tente novamente.');
    } finally {
      setPlacingBet(false);
    }
  };

  const getCategoryLabel = (categoria: string) => {
    return categories.find((option) => option.value === categoria)?.label || 'Sem categoria';
  };

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

      <h2 className="text-xl font-bold text-white mb-4">Votacoes em destaque</h2>

      {filteredVotacoes.length === 0 ? (
        <div className="text-cyan-200 text-center py-8 rounded-xl bg-cyan-900/30 border border-cyan-700">
          <p>
            {selectedCategory === 'todos'
              ? 'Nenhuma votacao ativa no momento. Volte em breve!'
              : `Nenhuma votacao ativa na categoria ${selectedCategory}.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {filteredVotacoes.map((votacao) => {
            const metadata = parsePollMetadata(votacao.descricao);
            const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
            const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();

            return (
              <div
                key={votacao.id}
                className="rounded-3xl border border-cyan-700/60 bg-slate-950/75 p-6 shadow-[0_18px_40px_-24px_rgba(34,211,238,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400"
              >
                <div className="mb-3 flex flex-wrap justify-center gap-2">
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                    {getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      metadata.tipo === 'enquete-candidatos'
                        ? 'bg-blue-500/15 text-blue-200'
                        : 'bg-slate-700/70 text-slate-200'
                    }`}
                  >
                    {metadata.tipo === 'enquete-candidatos' ? 'Enquete por candidato' : 'Opcoes livres'}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      isBetClosed ? 'bg-rose-500/15 text-rose-200' : 'bg-emerald-500/15 text-emerald-200'
                    }`}
                  >
                    {isBetClosed ? 'Aposta encerrada' : 'Aposta aberta'}
                  </span>
                </div>

                <h3 className="mb-2 text-center text-lg font-bold text-white">{votacao.titulo}</h3>
                <p className="mb-4 line-clamp-3 text-center text-sm leading-6 text-cyan-100/85">
                  {metadata.descricaoLimpa}
                </p>
                <p className="mb-4 text-center text-xs text-cyan-300/80">
                  Encerra em:{' '}
                  {metadata.encerramentoAposta
                    ? new Date(metadata.encerramentoAposta).toLocaleString('pt-BR')
                    : 'Nao definido'}
                </p>

                {metadata.tipo === 'enquete-candidatos' ? (
                  <div className="space-y-2.5">
                    {Array.isArray(votacao.opcoes) &&
                      (() => {
                        const parsedOptions = votacao.opcoes.map((candidato) => parsePollOption(candidato));
                        const votes = parsedOptions.map((option, idx) => {
                          const baseVotes = getSimulatedBaseBets(votacao.id, option, idx);
                          const realVotes = getRealBetCount(betCounts, votacao.id, option.label);
                          return baseVotes + realVotes;
                        });
                        const totalVotes = votes.reduce((acc, current) => acc + current, 0);

                        return parsedOptions.map((parsedOption, idx) => {
                          const percent = totalVotes > 0 ? Math.max(1, Math.round((votes[idx] / totalVotes) * 100)) : 0;

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => openBetModal(votacao, parsedOption)}
                              disabled={isBetClosed}
                              className="w-full rounded-2xl border border-cyan-800/80 bg-slate-900/90 px-3 py-2.5 text-left transition hover:border-cyan-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-cyan-900 bg-slate-800">
                                    {parsedOption.imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-full w-full object-cover" />
                                    ) : (
                                      <span className="text-xs font-semibold text-cyan-200">
                                        {parsedOption.label.slice(0, 1).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm font-semibold text-white">{parsedOption.label}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                                    {parsedOption.odds || '-'}
                                  </span>
                                  <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-200 ring-1 ring-blue-500/20">
                                    {percent}%
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[11px] font-medium text-cyan-300/75">{votes[idx]} apostas</p>
                            </button>
                          );
                        });
                      })()}
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    {Array.isArray(votacao.opcoes) &&
                      votacao.opcoes.map((opcao, idx) => {
                        const parsedOption = parsePollOption(opcao);
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-2 rounded-full bg-blue-500/15 px-3 py-1 text-xs text-blue-200"
                          >
                            {parsedOption.label}
                          </span>
                        );
                      })}
                  </div>
                )}

                <p className="mt-4 text-center text-xs font-medium uppercase tracking-[0.14em] text-cyan-300/70">
                  Selecione um candidato para abrir sua aposta
                </p>
              </div>
            );
          })}
        </div>
      )}

      {betModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-3">
          <div className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-cyan-100 bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-4 pb-4 pt-4 text-white">
              <div className="inline-flex rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                Confirmar aposta
              </div>
              <p className="mt-2 text-sm font-semibold text-white/95">{betModal.votacaoTitulo}</p>
            </div>

            <div className="overflow-y-auto p-4">
              <div className="-mt-7 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Candidato</p>
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-cyan-200 bg-white">
                    {betModal.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={betModal.imageUrl} alt={betModal.candidato} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-cyan-700">{betModal.candidato.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <p className="text-base font-bold text-slate-900">{betModal.candidato}</p>
                </div>
                <div className="mt-2 inline-flex rounded-full bg-gradient-to-r from-cyan-100 to-blue-100 px-2.5 py-1 text-xs font-extrabold tabular-nums text-cyan-900 ring-1 ring-cyan-200">
                  {betModal.odd.toFixed(2)}
                </div>
              </div>

              <label className="mt-4 block text-sm font-medium text-slate-700">Valor da aposta</label>
              <div className="mt-2 flex items-center rounded-xl border border-cyan-200 bg-cyan-50/50 px-3 py-2 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                <span className="text-sm font-bold text-blue-700">R$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={betAmount}
                  onChange={(event) => setBetAmount(event.target.value)}
                  placeholder={user ? 'Ex: 25' : 'Entre para apostar'}
                  disabled={!user && !loadingUser}
                  className="w-full border-0 bg-transparent px-2 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                />
              </div>

              {user ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[10, 25, 50, 100].map((value) => {
                      const disabled = value > Math.max(userBalance, 0);
                      const currentValue = Number(betAmount.replace(',', '.'));
                      const isActive = Number.isFinite(currentValue) && currentValue === value;

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setBetAmount(String(value))}
                          disabled={disabled}
                          className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold tabular-nums transition ${
                            disabled
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : isActive
                                ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                                : 'border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 hover:shadow-sm'
                          }`}
                        >
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)}
                        </button>
                      );
                    })}

                    {userBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => setBetAmount(String(Math.floor(userBalance * 100) / 100))}
                        className="col-span-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 hover:shadow-sm sm:col-span-4"
                      >
                        Usar saldo maximo
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid gap-1.5 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-2.5 text-xs sm:text-sm">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Saldo disponivel</span>
                      <span className="font-semibold text-slate-900">{formattedUserBalance}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Retorno total se vencer</span>
                      <span className="font-bold tabular-nums text-cyan-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialReturn)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Lucro liquido</span>
                      <span className="font-bold tabular-nums text-blue-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialProfit)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Faça login para apostar nesta votacao e salvar seu historico.
                </div>
              )}

              {betFeedback && (
                <p
                  className={`mt-3 rounded-xl px-3 py-2 text-sm font-medium ${
                    betFeedback.includes('sucesso') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {betFeedback}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBetModal(null);
                    setBetAmount('');
                    setBetFeedback(null);
                  }}
                  className="flex-1 rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handlePlaceBet()}
                  disabled={placingBet || loadingUser}
                  className="flex-1 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-cyan-600 disabled:opacity-60"
                >
                  {user ? (placingBet ? 'Enviando...' : 'Apostar') : 'Entrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
