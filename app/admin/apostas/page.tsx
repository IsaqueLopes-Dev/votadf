'use client';

import { useEffect, useState } from 'react';
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

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

const formatDateTime = (value: string) => {
  if (!value) return 'Sem registro';
  return new Date(value).toLocaleString('pt-BR');
};

const getStatusClasses = (status: BetStatus) => {
  if (status === 'ganhou') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'perdeu') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-amber-100 text-amber-700';
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'isaquelopespires@gmail.com')
  .split(',')
  .map((e) => e.trim())
  .filter((e) => e);

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

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || !user.email || !ADMIN_EMAILS.includes(user.email)) {
          router.push('/auth');
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
        router.push('/auth');
      } finally {
        setLoading(false);
      }
    };

    void checkAuth();
  }, [router]);

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      <header className="bg-blue-600 shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Administração</p>
            <h1 className="text-2xl font-bold text-white">Apostas</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-blue-700">Total de apostas</p>
            <p className="mt-2 text-3xl font-bold text-blue-900">{data?.totals.totalBets ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-amber-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-amber-700">Aguardando resultado</p>
            <p className="mt-2 text-3xl font-bold text-amber-900">{data?.totals.pending ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-emerald-700">Valor já pago (ganhou)</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{formatCurrency(data?.totals.totalPotentialPayout ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-emerald-700">Valor em ganhos</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{formatCurrency(data?.totals.totalWonValue ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-rose-700">Valor em perdas</p>
            <p className="mt-2 text-3xl font-bold text-rose-900">{formatCurrency(data?.totals.totalLostValue ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Valor total apostado</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(data?.totals.totalStaked ?? 0)}</p>
          </div>
        </section>

        <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Gestão manual de apostas</h2>
              <p className="mt-1 text-sm text-slate-500">Marque cada aposta como ganhou ou perdeu. Quando marcar ganhou, o crédito é aplicado automaticamente no saldo do usuário.</p>
            </div>
            <button
              onClick={() => void loadData()}
              className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
            >
              Atualizar
            </button>
          </div>

          {errorMessage && <p className="mb-4 text-sm text-red-600">{errorMessage}</p>}
          {feedbackMessage && <p className="mb-4 text-sm text-blue-700">{feedbackMessage}</p>}

          {data?.bets?.length ? (
            <div className="space-y-3">
              {data.bets.map((bet) => {
                const isBusy = settlingBetId === bet.id;
                const isPending = bet.status === 'aguardando';

                return (
                  <div key={`${bet.userId}-${bet.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusClasses(bet.status)}`}>
                            {bet.status === 'ganhou' ? 'Ganhou' : bet.status === 'perdeu' ? 'Perdeu' : 'Aguardando'}
                          </span>
                          <p className="font-semibold text-slate-900">{bet.userDisplayName}</p>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{bet.userEmail || 'Sem e-mail'} </p>
                        <p className="mt-1 text-sm text-slate-700">Votação: <span className="font-medium">{bet.votacaoTitulo || 'Sem título'}</span></p>
                        <p className="text-sm text-slate-700">Candidato: <span className="font-medium">{bet.candidato}</span></p>
                        <p className="text-xs text-slate-500 mt-1">Aposta em {formatDateTime(bet.createdAt)}</p>
                        {bet.status !== 'aguardando' && (
                          <p className="text-xs text-slate-500">Liquidada em {formatDateTime(bet.settledAt)} por {bet.settledByEmail || 'admin'}</p>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[380px]">
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Aposta</p>
                          <p className="mt-2 text-lg font-bold text-slate-900">{formatCurrency(bet.amount)}</p>
                          <p className="mt-1 text-xs text-slate-500">Odd {bet.odd.toFixed(2)}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Retorno potencial</p>
                          <p className="mt-2 text-lg font-bold text-emerald-700">{formatCurrency(bet.potentialReturn)}</p>
                          <p className="mt-1 text-xs text-slate-500">Saldo atual: {formatCurrency(bet.userBalance)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => void settleBet(bet, 'ganhou')}
                        disabled={!isPending || isBusy}
                        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? 'Salvando...' : 'Marcar ganhou'}
                      </button>
                      <button
                        onClick={() => void settleBet(bet, 'perdeu')}
                        disabled={!isPending || isBusy}
                        className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? 'Salvando...' : 'Marcar perdeu'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-600 text-center py-8">Nenhuma aposta registrada ainda.</p>
          )}
        </div>
      </main>
    </div>
  );
}
