'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

type BetStatus = 'aguardando' | 'ganhou' | 'perdeu';

type BetRecord = {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  userBalance: number;
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  amount: number;
  potentialReturn: number;
  createdAt: string;
  status: BetStatus;
  settledAt: string;
  settledByEmail: string;
};

type BetsResponse = {
  bets: BetRecord[];
  totals: {
    totalBets: number;
    pending: number;
    won: number;
    lost: number;
    totalStaked: number;
    totalPotentialPayout: number;
    totalWonValue: number;
    totalLostValue: number;
  };
};

type SummaryCard = {
  label: string;
  value: string | number;
  hint: string;
  accent: string;
  glow: string;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const formatDateTime = (value: string) => {
  if (!value) return 'Sem registro';
  return new Date(value).toLocaleString('pt-BR');
};

const getStatusBadge = (status: BetStatus) => {
  if (status === 'ganhou') {
    return 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30';
  }

  if (status === 'perdeu') {
    return 'bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/30';
  }

  return 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30';
};

const getRiskTone = (bet: BetRecord) => {
  if (bet.userBalance < bet.amount) {
    return {
      label: 'Saldo insuficiente',
      className: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
    };
  }

  if (bet.potentialReturn >= 1000) {
    return {
      label: 'Retorno elevado',
      className: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30',
    };
  }

  return {
    label: 'Volume acima do padrão',
    className: 'bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30',
  };
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Erro inesperado.';
};

const fetchBets = async (accessToken: string) => {
  const response = await fetch('/api/admin/bets', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível carregar as apostas.');
  }

  return data as BetsResponse;
};

export default function AdminApostasPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BetsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [settlingBetId, setSettlingBetId] = useState<string | null>(null);
  const router = useRouter();

  const pendingBets = useMemo(
    () => (data?.bets || []).filter((bet) => bet.status === 'aguardando'),
    [data?.bets]
  );

  const topMarkets = useMemo(() => {
    const byMarket = new Map<string, { title: string; count: number; amount: number; payout: number }>();

    pendingBets.forEach((bet) => {
      const current = byMarket.get(bet.votacaoId) || {
        title: bet.votacaoTitulo || 'Mercado sem título',
        count: 0,
        amount: 0,
        payout: 0,
      };

      current.count += 1;
      current.amount += bet.amount;
      current.payout += bet.potentialReturn;
      byMarket.set(bet.votacaoId, current);
    });

    return Array.from(byMarket.values()).sort((a, b) => b.payout - a.payout).slice(0, 4);
  }, [pendingBets]);

  const topUsers = useMemo(() => {
    const byUser = new Map<string, { name: string; email: string; total: number; bets: number }>();

    (data?.bets || []).forEach((bet) => {
      const current = byUser.get(bet.userId) || {
        name: bet.userDisplayName || 'Usuário sem identificação',
        email: bet.userEmail || 'Sem e-mail',
        total: 0,
        bets: 0,
      };

      current.total += bet.amount;
      current.bets += 1;
      byUser.set(bet.userId, current);
    });

    return Array.from(byUser.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [data?.bets]);

  const riskAlerts = useMemo(
    () =>
      pendingBets
        .filter((bet) => bet.amount >= 250 || bet.potentialReturn >= 1000 || bet.userBalance < bet.amount)
        .sort((a, b) => b.potentialReturn - a.potentialReturn)
        .slice(0, 5),
    [pendingBets]
  );

  const summaryCards = useMemo<SummaryCard[]>(
    () => [
      {
        label: 'Total de apostas',
        value: data?.totals.totalBets ?? 0,
        hint: 'Volume operacional acumulado',
        accent: 'text-cyan-200',
        glow: 'from-cyan-500/18 via-cyan-500/6 to-transparent',
      },
      {
        label: 'Aguardando resultado',
        value: data?.totals.pending ?? 0,
        hint: 'Bilhetes ainda em aberto',
        accent: 'text-amber-200',
        glow: 'from-amber-500/18 via-amber-500/6 to-transparent',
      },
      {
        label: 'Valor já pago',
        value: formatCurrency(data?.totals.totalPotentialPayout ?? 0),
        hint: 'Crédito total aplicado em apostas ganhas',
        accent: 'text-emerald-200',
        glow: 'from-emerald-500/18 via-emerald-500/6 to-transparent',
      },
      {
        label: 'Valor em ganhos',
        value: formatCurrency(data?.totals.totalWonValue ?? 0),
        hint: 'Lucro pago aos usuários vencedores',
        accent: 'text-emerald-200',
        glow: 'from-emerald-400/14 via-emerald-400/6 to-transparent',
      },
      {
        label: 'Valor em perdas',
        value: formatCurrency(data?.totals.totalLostValue ?? 0),
        hint: 'Apostas liquidadas como perda',
        accent: 'text-rose-200',
        glow: 'from-rose-500/18 via-rose-500/6 to-transparent',
      },
      {
        label: 'Valor total apostado',
        value: formatCurrency(data?.totals.totalStaked ?? 0),
        hint: 'Capital movimentado na operação',
        accent: 'text-slate-100',
        glow: 'from-white/12 via-white/4 to-transparent',
      },
    ],
    [data]
  );

  const loadData = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const nextData = await fetchBets(session.access_token);
      setData(nextData);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login');
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error('Sessão administrativa não encontrada.');
        }

        const nextData = await fetchBets(session.access_token);
        setData(nextData);
        setErrorMessage('');
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    void checkAuth();
  }, [router]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadData();
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const settleBet = async (bet: BetRecord, status: 'ganhou' | 'perdeu') => {
    try {
      setSettlingBetId(bet.id);
      setFeedbackMessage('');

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const response = await fetch('/api/admin/bets/settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: bet.userId,
          betId: bet.id,
          status,
        }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível atualizar a aposta.');
      }

      setFeedbackMessage(payload.message || 'Aposta atualizada com sucesso.');
      await loadData();
    } catch (error) {
      setFeedbackMessage(getErrorMessage(error));
    } finally {
      setSettlingBetId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 text-sm text-slate-200 backdrop-blur-xl">
          Carregando painel de apostas...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      <header className="border-b border-white/10 bg-black/30 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Voltar
            </Link>

            <div className="h-10 w-px bg-white/10" />

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                Administração
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Operação de apostas</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Acompanhe exposição por mercado, usuários de maior volume e liquidação manual com visão operacional mais clara.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Auto refresh</p>
              <p className="mt-1 text-lg font-semibold text-white">30s</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Pendências</p>
              <p className="mt-1 text-lg font-semibold text-amber-200">{pendingBets.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Alertas</p>
              <p className="mt-1 text-lg font-semibold text-rose-200">{riskAlerts.length}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {summaryCards.map((card) => (
            <article
              key={card.label}
              className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#07111d]/90 p-5 shadow-[0_25px_80px_rgba(0,0,0,0.22)]"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.glow}`} />
              <div className="relative z-10">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{card.label}</p>
                <p className={`mt-4 text-3xl font-semibold tracking-tight ${card.accent}`}>{card.value}</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">{card.hint}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="mb-8 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,19,32,0.96),rgba(7,13,23,0.96))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.24)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                  Inteligência operacional
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Monitoramento ativo</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Mercados mais expostos e usuários com maior volume para leitura rápida da operação.
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                Atualização automática
              </span>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-200">
                    Mercados mais expostos
                  </h3>
                  <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-slate-300">
                    {topMarkets.length} listados
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {topMarkets.length ? (
                    topMarkets.map((item, index) => (
                      <div key={item.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">#{index + 1}</p>
                            <p className="mt-2 text-sm font-semibold leading-6 text-white">{item.title}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Exposição</p>
                            <p className="mt-1 text-sm font-semibold text-amber-200">{formatCurrency(item.payout)}</p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-white/5 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Apostas</p>
                            <p className="mt-1 text-sm font-semibold text-white">{item.count}</p>
                          </div>
                          <div className="rounded-2xl bg-white/5 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Volume</p>
                            <p className="mt-1 text-sm font-semibold text-cyan-200">{formatCurrency(item.amount)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-sm text-slate-400">
                      Nenhum mercado com exposição pendente.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-200">
                    Usuários de maior volume
                  </h3>
                  <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-slate-300">
                    {topUsers.length} perfis
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {topUsers.length ? (
                    topUsers.map((user, index) => (
                      <div key={`${user.email}-${user.name}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Top {index + 1}</p>
                            <p className="mt-2 text-sm font-semibold text-white">{user.name}</p>
                            <p className="mt-1 break-all text-xs text-slate-400">{user.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Volume</p>
                            <p className="mt-1 text-sm font-semibold text-emerald-200">{formatCurrency(user.total)}</p>
                          </div>
                        </div>
                        <div className="mt-4 rounded-2xl bg-white/5 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Quantidade de apostas</p>
                          <p className="mt-1 text-sm font-semibold text-white">{user.bets}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-sm text-slate-400">
                      Ainda não há volume suficiente para montar o ranking.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,10,16,0.96),rgba(15,9,14,0.96))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-200/80">Gestão de risco</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Alertas de risco</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Apostas que pedem revisão manual por valor, retorno potencial ou inconsistência de saldo.
            </p>

            <div className="mt-6 space-y-3">
              {riskAlerts.length ? (
                riskAlerts.map((bet) => {
                  const tone = getRiskTone(bet);

                  return (
                    <div key={bet.id} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{bet.userDisplayName}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.className}`}>
                          {tone.label}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{bet.votacaoTitulo}</p>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-2xl bg-black/20 px-3 py-2">
                          <p className="uppercase tracking-[0.12em] text-slate-500">Aposta</p>
                          <p className="mt-1 font-semibold text-white">{formatCurrency(bet.amount)}</p>
                        </div>
                        <div className="rounded-2xl bg-black/20 px-3 py-2">
                          <p className="uppercase tracking-[0.12em] text-slate-500">Retorno</p>
                          <p className="mt-1 font-semibold text-amber-200">{formatCurrency(bet.potentialReturn)}</p>
                        </div>
                        <div className="rounded-2xl bg-black/20 px-3 py-2">
                          <p className="uppercase tracking-[0.12em] text-slate-500">Saldo</p>
                          <p className="mt-1 font-semibold text-slate-100">{formatCurrency(bet.userBalance)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[24px] border border-white/10 bg-black/20 p-5 text-sm leading-6 text-slate-300">
                  Nenhum alerta crítico identificado pelos critérios atuais.
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="rounded-[34px] border border-slate-300 bg-[linear-gradient(180deg,#ffffff,#f3f6fa)] p-6 text-slate-950 shadow-[0_40px_100px_rgba(0,0,0,0.2)] sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                Liquidação manual
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Gestão manual de apostas</h2>
              <p className="mt-3 text-base leading-7 text-slate-700">
                Marque cada aposta como ganhou ou perdeu. Quando a aposta é liquidada como ganho, o crédito é aplicado
                automaticamente no saldo do usuário.
              </p>
            </div>

            <button
              onClick={() => void loadData()}
              className="inline-flex items-center justify-center rounded-full border border-slate-400 bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:border-slate-500 hover:bg-slate-50"
            >
              Atualizar painel
            </button>
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          {feedbackMessage && (
            <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
              {feedbackMessage}
            </div>
          )}

          {data?.bets?.length ? (
            <div className="mt-6 space-y-4">
              {data.bets.map((bet) => {
                const isBusy = settlingBetId === bet.id;
                const isPending = bet.status === 'aguardando';

                return (
                  <article
                    key={`${bet.userId}-${bet.id}`}
                    className="overflow-hidden rounded-[30px] border border-slate-300 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.08)]"
                  >
                    <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f7fafc)] px-5 py-5 sm:px-6">
                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] xl:items-start">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${getStatusBadge(bet.status)}`}>
                              {bet.status === 'ganhou' ? 'Ganhou' : bet.status === 'perdeu' ? 'Perdeu' : 'Aguardando'}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Aposta #{bet.id.slice(0, 8)}
                            </span>
                          </div>
                          <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{bet.userDisplayName}</h3>
                          <p className="mt-2 break-all text-base font-medium text-slate-700">{bet.userEmail || 'Sem e-mail'}</p>
                          <div className="mt-5 grid gap-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Votação</p>
                              <p className="mt-2 text-base font-semibold leading-7 text-slate-950">
                                {bet.votacaoTitulo || 'Sem título'}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Candidato</p>
                              <p className="mt-2 text-base font-semibold text-slate-950">{bet.candidato}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                          <div className="rounded-3xl border border-slate-300 bg-white px-5 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Aposta</p>
                            <p className="mt-2 text-2xl font-bold text-slate-950">{formatCurrency(bet.amount)}</p>
                            <p className="mt-2 text-sm font-medium text-slate-700">Odd {bet.odd.toFixed(2)}x</p>
                          </div>
                          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                              Retorno potencial
                            </p>
                            <p className="mt-2 text-2xl font-bold text-emerald-900">{formatCurrency(bet.potentialReturn)}</p>
                            <p className="mt-2 text-sm font-medium text-emerald-800">Pagamento previsto</p>
                          </div>
                          <div className="rounded-3xl border border-slate-300 bg-slate-100 px-5 py-4 sm:col-span-2 xl:col-span-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                              Saldo atual
                            </p>
                            <p className="mt-2 text-2xl font-bold text-slate-950">{formatCurrency(bet.userBalance)}</p>
                            <p className="mt-2 text-sm font-medium text-slate-700">Saldo disponível do usuário</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50/80 px-5 py-5 sm:px-6">
                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                        <div className="grid gap-3">
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Registro</p>
                            <p className="mt-2 text-base font-medium text-slate-800">
                              Aposta registrada em {formatDateTime(bet.createdAt)}
                            </p>
                          </div>
                          {bet.status !== 'aguardando' && (
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Liquidação</p>
                              <p className="mt-2 text-base font-medium text-slate-800">
                                Liquidada em {formatDateTime(bet.settledAt)} por {bet.settledByEmail || 'admin'}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            onClick={() => void settleBet(bet, 'ganhou')}
                            disabled={!isPending || isBusy}
                            className="min-w-[170px] rounded-2xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? 'Salvando...' : 'Marcar ganhou'}
                          </button>
                          <button
                            onClick={() => void settleBet(bet, 'perdeu')}
                            disabled={!isPending || isBusy}
                            className="min-w-[170px] rounded-2xl bg-rose-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? 'Salvando...' : 'Marcar perdeu'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
              Nenhuma aposta registrada ainda.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
