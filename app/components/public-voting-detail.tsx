'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabaseClient';
import BitcoinEntertainmentMarket from './bitcoin-entertainment-market';
import CategoryIcon from './category-icon';
import {
  buildVotingOptionStats,
  getCategoryLabel,
  getDisplayedOdd,
  getVotingStatus,
  parsePollMetadata,
  type BetCountsMap,
  type VotingRecord,
} from '../utils/voting-market';
import UiverseLoader from './uiverse-loader';

type BetCommentItem = {
  id: string;
  votacao_id: string;
  user_id: string;
  username: string;
  message: string;
  avatar_url?: string;
  created_at: string;
};

type BetModalState = {
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  imageUrl: string;
};

type PublicVotingDetailProps = {
  votacao: VotingRecord;
};

type UserBetItem = {
  id: string;
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  amount: number;
  potentialReturn: number;
  createdAt: string;
};

export default function PublicVotingDetail({ votacao }: PublicVotingDetailProps) {
  const [betCounts, setBetCounts] = useState<BetCountsMap>({});
  const [comments, setComments] = useState<BetCommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentStatus, setCommentStatus] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [betModal, setBetModal] = useState<BetModalState | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [placingBet, setPlacingBet] = useState(false);
  const [betFeedback, setBetFeedback] = useState<string | null>(null);

  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const metadata = parsePollMetadata(votacao.descricao);
  const isBitcoinEntertainmentMarket = metadata.tipo === 'bitcoin-direcao';
  const status = getVotingStatus(votacao);
  const optionStats = useMemo(() => buildVotingOptionStats(votacao, betCounts), [betCounts, votacao]);
  const userPositions = useMemo(() => {
    const bets = Array.isArray(user?.user_metadata?.bets) ? (user.user_metadata.bets as UserBetItem[]) : [];
    return bets
      .filter((bet) => bet.votacaoId === votacao.id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [user, votacao.id]);
  const potentialReturn = betModal
    ? Math.max(0, Number(betAmount.replace(',', '.')) || 0) * betModal.odd
    : 0;

  useEffect(() => {
    router.prefetch('/home');
  }, [router]);

  const handleBackHome = () => {
    if (typeof window !== 'undefined') {
      const referrer = document.referrer || '';
      const currentOrigin = window.location.origin;

      if (referrer.startsWith(currentOrigin) && referrer.includes('/home')) {
        router.back();
        return;
      }
    }

    router.push('/home');
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        setUser(session?.user ?? null);
      } finally {
        setLoadingUser(false);
      }
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoadingUser(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const loadMarketSignals = async () => {
      try {
        const [countsResponse, commentsResponse] = await Promise.all([
          fetch('/api/votacoes/bet-counts', { method: 'GET', cache: 'no-store' }),
          fetch(`/api/votacoes/comments?votacaoId=${encodeURIComponent(votacao.id)}`, {
            method: 'GET',
            cache: 'no-store',
          }),
        ]);

        const countsPayload = (await countsResponse.json()) as { counts?: BetCountsMap };
        const commentsPayload = (await commentsResponse.json()) as {
          comments?: BetCommentItem[];
          error?: string;
        };

        setBetCounts(countsPayload.counts || {});
        setComments(Array.isArray(commentsPayload.comments) ? commentsPayload.comments : []);
        setCommentStatus(commentsResponse.ok ? null : commentsPayload.error || 'Não foi possível carregar os comentários.');
      } catch {
        setBetCounts({});
        setCommentStatus('Não foi possível carregar os comentários.');
      } finally {
        setCommentsLoading(false);
      }
    };

    void loadMarketSignals();
  }, [votacao.id]);

  const buildCurrentUrl = () => `/mercados/${votacao.id}`;

  const requireAuthenticatedSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !session.user) {
      setUser(null);
      window.location.href = `/login?next=${encodeURIComponent(buildCurrentUrl())}`;
      return null;
    }

    if (!user || user.id !== session.user.id) {
      setUser(session.user);
    }

    return session;
  };

  const openBetModal = async (option: { label: string; odds: string; imageUrl: string }) => {
    const session = await requireAuthenticatedSession();
    if (!session) return;

    if (status.isClosed) {
      setBetFeedback('O prazo para apostar nesta votação já foi encerrado.');
      return;
    }

    const odd = Number(option.odds);
    if (option.odds === '' || !Number.isFinite(odd) || odd <= 0) {
      setBetFeedback('Esta opção ainda não possui odd configurada.');
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

    const session = await requireAuthenticatedSession();
    if (!session?.user) return;

    const rawBalance = session.user.user_metadata?.balance ?? session.user.user_metadata?.saldo ?? 0;
    const parsedBalance = typeof rawBalance === 'number' ? rawBalance : Number(String(rawBalance).replace(',', '.'));
    const userBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
    const amount = Number(betAmount.replace(',', '.'));

    if (!Number.isFinite(amount) || amount <= 0) {
      setBetFeedback('Digite um valor válido para apostar.');
      return;
    }

    if (amount > userBalance) {
      setBetFeedback('Saldo insuficiente para essa aposta.');
      return;
    }

    setPlacingBet(true);
    setBetFeedback(null);

    try {
      const existingBets = Array.isArray(session.user.user_metadata?.bets) ? session.user.user_metadata.bets : [];
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
          ...session.user.user_metadata,
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

      const countsResponse = await fetch('/api/votacoes/bet-counts', { method: 'GET', cache: 'no-store' });
      const countsPayload = (await countsResponse.json()) as { counts?: BetCountsMap };
      setBetCounts(countsPayload.counts || {});
      setBetFeedback('Aposta registrada com sucesso.');

      window.setTimeout(() => {
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

  const submitComment = async () => {
    const session = await requireAuthenticatedSession();
    if (!session?.access_token) return;

    const message = commentDraft.trim();
    if (!message) {
      setCommentStatus('Digite um comentário.');
      return;
    }

    try {
      setCommentStatus('Enviando comentário...');

      const response = await fetch('/api/votacoes/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ votacaoId: votacao.id, message }),
      });

      const payload = (await response.json()) as { comment?: BetCommentItem; error?: string };
      if (!response.ok || !payload.comment) {
        setCommentStatus(payload.error || 'Não foi possível publicar o comentário.');
        return;
      }

      setComments((current) => [...current, payload.comment!]);
      setCommentDraft('');
      setCommentStatus('Comentário publicado.');
    } catch {
      setCommentStatus('Não foi possível publicar o comentário.');
    }
  };

  const rules = [
    status.closeAt !== 'Não informado'
      ? `Este mercado aceita novas entradas até ${status.closeAt}.`
      : 'Este mercado permanece aberto enquanto estiver marcado como ativo.',
    'As odds exibidas são as odds disponíveis no momento da escolha.',
    'Depois do encerramento do mercado, novas posições ficam bloqueadas.',
  ];

  if (isBitcoinEntertainmentMarket) {
    return <BitcoinEntertainmentMarket votacao={votacao} />;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBackHome}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
        >
          <span aria-hidden>←</span>
          Voltar
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,#0f172a_0%,#111827_46%,#0b1120_100%)] shadow-[0_30px_100px_-55px_rgba(34,211,238,0.45)]">
            <div className="p-6 lg:p-8">
              <div className="flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-300"
                      title={getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                      aria-label={getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                    >
                      <CategoryIcon category={metadata.categoria || 'todos'} className="h-4.5 w-4.5" />
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold [font-family:var(--font-poppins),sans-serif] ${
                        status.isClosed
                          ? 'bg-slate-700 text-slate-100 shadow-[0_10px_24px_-12px_rgba(51,65,85,0.95)]'
                          : status.label === 'Em aberto'
                            ? 'bg-emerald-600 text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,0.9)]'
                            : 'bg-amber-400 text-[#2b1600] shadow-[0_10px_24px_-12px_rgba(251,191,36,0.95)]'
                      }`}
                    >
                      {status.isClosed ? 'Encerrado' : status.footerLabel}
                    </span>
                  </div>
                  <h1 className="mt-4 text-3xl font-bold leading-tight text-white lg:text-4xl">{votacao.titulo}</h1>

                  <div className="mt-6 space-y-3">
                    {optionStats.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => void openBetModal(option)}
                        disabled={status.isClosed || option.odds === ''}
                        className="w-full rounded-[22px] border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-[24px] sm:px-4 sm:py-4"
                      >
                        <div className="flex items-center justify-between gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#141a22] sm:h-12 sm:w-12 sm:rounded-2xl">
                              {option.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={option.imageUrl} alt={option.label} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-white sm:text-sm">{option.label.slice(0, 1).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white sm:text-base">{option.label}</p>
                              <p className="mt-0.5 text-xs text-zinc-400 sm:mt-1 sm:text-sm">Odds {getDisplayedOdd(option.odds)}</p>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                            <span className="rounded-full bg-cyan-500/12 px-2.5 py-1 text-xs font-semibold text-cyan-300 sm:px-3 sm:py-1.5 sm:text-sm">
                              {getDisplayedOdd(option.odds)}
                            </span>
                            <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-xs font-semibold text-white sm:px-3 sm:py-1.5 sm:text-sm">
                              {option.percent}%
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-white/10 bg-[#0f131a] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Descrição</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Contexto completo da votação</h2>
              <p className="mt-4 text-sm leading-7 text-zinc-300">{metadata.descricaoLimpa || 'Sem descrição adicional.'}</p>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[#0f131a] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Regras</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Detalhes do mercado</h2>
              <div className="mt-4 space-y-3">
                {rules.map((rule) => (
                  <div key={rule} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-zinc-300">
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-[#0f131a] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Comentários</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Leitura da comunidade</h2>
              </div>
              <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs font-semibold text-zinc-300">
                {comments.length} comentários
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {commentsLoading ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-zinc-400">
                  <UiverseLoader label="Carregando comentários..." />
                </div>
              ) : comments.length > 0 ? (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-white">{comment.username}</span>
                      <span className="text-xs text-zinc-500">{new Date(comment.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">{comment.message}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-zinc-400">
                  Ainda não há comentários neste mercado.
                </div>
              )}
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                rows={4}
                placeholder={user ? 'Compartilhe sua leitura desse mercado...' : 'Faça login para comentar'}
                disabled={!user}
                className="w-full rounded-2xl border border-white/10 bg-[#0a0d12] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-500">
                  {commentStatus || (user ? 'Seu comentário aparece logo abaixo.' : 'Entre para participar da conversa.')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (user) {
                      void submitComment();
                      return;
                    }

                    window.location.href = `/login?next=${encodeURIComponent(buildCurrentUrl())}`;
                  }}
                  className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  {user ? 'Publicar comentário' : 'Entrar'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-[32px] border border-white/10 bg-[#0f131a] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Painel do usuário</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Suas posições</h2>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Saldo disponível</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  Number(user?.user_metadata?.balance ?? user?.user_metadata?.saldo ?? 0) || 0
                )}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {loadingUser ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-zinc-400">
                  <UiverseLoader label="Carregando seus dados..." />
                </div>
              ) : userPositions.length > 0 ? (
                userPositions.map((bet) => (
                  <div key={bet.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{bet.candidato}</p>
                      <span className="rounded-full bg-cyan-500/12 px-3 py-1 text-xs font-semibold text-cyan-300">
                        {bet.odd.toFixed(2)}x
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">
                      Entrada de{' '}
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bet.amount)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Retorno potencial{' '}
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bet.potentialReturn)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-zinc-400">
                  {user
                    ? 'Você ainda não tem posições registradas neste mercado.'
                    : 'Faça login para acompanhar seus palpites e posições neste mercado.'}
                </div>
              )}
            </div>
          </section>

        </aside>
      </div>

      {betModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/86 p-4 backdrop-blur-md">
          <div className="flex w-full max-w-[24.5rem] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#08111f] shadow-[0_32px_100px_rgba(2,6,23,0.72)] ring-1 ring-white/6 sm:max-w-[28rem] sm:rounded-[32px]">
            <div className="relative overflow-hidden bg-[linear-gradient(145deg,#07111f_0%,#0f1f3d_42%,#0a84b7_100%)] px-5 pb-4 pt-4 text-white sm:px-6 sm:pb-5 sm:pt-5">
              <div className="absolute -right-8 top-3 h-24 w-24 rounded-full bg-cyan-300/12 blur-2xl" />
              <div className="absolute left-8 top-0 h-16 w-16 rounded-full bg-white/8 blur-2xl" />
              <button
                type="button"
                onClick={() => {
                  setBetModal(null);
                  setBetAmount('');
                  setBetFeedback(null);
                }}
                className="relative z-10 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-50 transition hover:bg-white/15"
              >
                <span aria-hidden>←</span>
                Voltar
              </button>
              <p className="relative z-10 mt-2 text-lg font-semibold leading-tight text-white sm:mt-3 sm:text-[1.65rem]">{betModal.votacaoTitulo}</p>
              <p className="mt-2 text-sm text-blue-50/85">Revise os dados antes de confirmar sua posição.</p>
            </div>

            <div className="max-h-[58vh] overflow-y-auto bg-[linear-gradient(180deg,#06101d_0%,#081423_18%,#0a1627_100%)] p-3.5 sm:max-h-[56vh] sm:p-4">
              <div className="-mt-8 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98)_0%,rgba(10,18,32,0.98)_100%)] p-3.5 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.7)] sm:-mt-10 sm:rounded-[28px] sm:p-4">
                <div className="mt-1 flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-white/10 bg-[#111827] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-16 sm:w-16 sm:rounded-[20px]">
                    {betModal.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={betModal.imageUrl} alt={betModal.candidato} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-base font-bold text-cyan-300 sm:text-lg">{betModal.candidato.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">Escolha confirmada</p>
                    <p className="mt-1 text-base font-semibold leading-tight text-white sm:text-lg">{betModal.candidato}</p>
                    <p className="mt-1 text-xs text-slate-500">Sua posição será registrada com a odd atual.</p>
                  </div>
                </div>
                <div className="mt-3 inline-flex rounded-[16px] border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-extrabold tabular-nums text-cyan-200 shadow-sm sm:rounded-[18px] sm:px-3.5 sm:py-1.5 sm:text-sm">
                  {betModal.odd.toFixed(2)}x
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94)_0%,rgba(10,18,32,0.94)_100%)] p-3.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.5)] sm:mt-5 sm:p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-white">Valor da aposta</label>
                  <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/75">Em BRL</span>
                </div>
                <div className="flex items-center rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] focus-within:border-cyan-400/40 focus-within:bg-black/25 focus-within:ring-4 focus-within:ring-cyan-500/10 sm:py-3.5">
                  <span className="text-sm font-bold text-cyan-300 sm:text-base">R$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={betAmount}
                    onChange={(event) => setBetAmount(event.target.value)}
                    placeholder={user ? 'Ex: 25' : 'Entre para apostar'}
                    disabled={!user && !loadingUser}
                    className="w-full border-0 bg-transparent px-3 text-base font-semibold text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:text-slate-500 sm:text-lg"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94)_0%,rgba(10,18,32,0.94)_100%)] p-3 text-sm shadow-[0_18px_40px_-28px_rgba(15,23,42,0.5)] sm:p-4">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-3 py-3 shadow-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Odd atual</span>
                  <span className="mt-1.5 block text-base font-bold tabular-nums text-white sm:text-lg">
                    {betModal.odd.toFixed(2)}x
                  </span>
                </div>
                <div className="rounded-[18px] border border-cyan-400/20 bg-cyan-400/10 px-3 py-3 shadow-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Retorno estimado</span>
                  <span className="mt-1.5 block text-base font-bold tabular-nums text-cyan-100 sm:text-lg">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialReturn)}
                  </span>
                </div>
              </div>

              {betFeedback && (
                <p
                  className={`mt-4 rounded-[18px] px-4 py-2.5 text-sm font-medium ${
                    betFeedback.includes('sucesso')
                      ? 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                      : 'border border-rose-400/20 bg-rose-500/10 text-rose-200'
                  }`}
                >
                  {betFeedback}
                </p>
              )}

              <div className="mt-4 flex gap-3 sm:mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setBetModal(null);
                    setBetAmount('');
                    setBetFeedback(null);
                  }}
                  className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handlePlaceBet()}
                  disabled={placingBet || loadingUser}
                  className="flex-1 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#0f5ae0_42%,#0ea5a4_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(14,116,144,0.8)] transition hover:brightness-105 disabled:opacity-60"
                >
                  {user ? (placingBet ? 'Enviando...' : 'Confirmar') : 'Entrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
