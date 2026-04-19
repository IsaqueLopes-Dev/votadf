'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

type WithdrawalRecord = {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  cpf: string;
  amount: number;
  status: WithdrawalStatus;
  createdAt: string;
  approvedAt: string;
  rejectedAt: string;
  decidedByEmail: string;
};

type WithdrawalsResponse = {
  withdrawals: WithdrawalRecord[];
  totals: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    pendingAmount: number;
    approvedAmount: number;
    rejectedAmount: number;
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Erro inesperado.';
};

const fetchWithdrawals = async (accessToken: string) => {
  const response = await fetch('/api/admin/withdrawals', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível carregar saques.');
  }

  return data as WithdrawalsResponse;
};

export default function AdminSaquesPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WithdrawalsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const router = useRouter();

  const pendingWithdrawals = useMemo(
    () => (data?.withdrawals || []).filter((item) => item.status === 'pending'),
    [data?.withdrawals]
  );

  const highValueAlerts = useMemo(
    () => pendingWithdrawals.filter((item) => item.amount >= 250).sort((a, b) => b.amount - a.amount).slice(0, 5),
    [pendingWithdrawals]
  );

  const repeatedUsers = useMemo(() => {
    const byUser = new Map<string, { name: string; count: number; total: number }>();

    (data?.withdrawals || []).forEach((item) => {
      const current = byUser.get(item.userId) || { name: item.userDisplayName || 'Usuario', count: 0, total: 0 };
      current.count += 1;
      current.total += item.amount;
      byUser.set(item.userId, current);
    });

    return Array.from(byUser.values()).filter((item) => item.count > 1).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [data?.withdrawals]);

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

        const payload = await fetchWithdrawals(session.access_token);
        setData(payload);
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

  const loadData = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const payload = await fetchWithdrawals(session.access_token);
      setData(payload);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const decide = async (item: WithdrawalRecord, decision: 'approved' | 'rejected') => {
    try {
      setUpdatingId(item.id);
      setFeedbackMessage('');

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const response = await fetch('/api/admin/withdrawals/decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: item.userId,
          requestId: item.id,
          decision,
        }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível atualizar saque.');
      }

      setFeedbackMessage(payload.message || 'Saque atualizado.');
      await loadData();
    } catch (error) {
      setFeedbackMessage(getErrorMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 text-sm text-slate-200 backdrop-blur-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      <header className="border-b border-white/10 bg-black/20 shadow-md backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center">
          <Link href="/admin" className="flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Administração</p>
            <h1 className="text-2xl font-bold text-white">Saques</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-blue-700">Total de solicitações</p>
            <p className="mt-2 text-3xl font-bold text-blue-900">{data?.totals.total ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-amber-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-amber-700">Pendentes</p>
            <p className="mt-2 text-3xl font-bold text-amber-900">{data?.totals.pending ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">{formatCurrency(data?.totals.pendingAmount ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-emerald-700">Aprovados</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{data?.totals.approved ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">{formatCurrency(data?.totals.approvedAmount ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-rose-700">Recusados</p>
            <p className="mt-2 text-3xl font-bold text-rose-900">{data?.totals.rejected ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">{formatCurrency(data?.totals.rejectedAmount ?? 0)}</p>
          </div>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <h2 className="text-xl font-semibold text-white">Controle de liquidez</h2>
            <p className="mt-1 text-sm text-slate-300">Exposição pendente, usuários recorrentes e fila operacional.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Fila pendente</p>
                <p className="mt-3 text-2xl font-bold text-white">{pendingWithdrawals.length}</p>
                <p className="mt-1 text-sm text-slate-300">solicitacoes aguardando decisao</p>
                <p className="mt-3 text-xs text-slate-400">
                  Valor pendente: <span className="font-semibold text-slate-200">{formatCurrency(data?.totals.pendingAmount ?? 0)}</span>
                </p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Padrao recorrente</p>
                <p className="mt-3 text-2xl font-bold text-white">{repeatedUsers.length}</p>
                <p className="mt-1 text-sm text-slate-300">usuarios com multiplas solicitacoes</p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/10 bg-black/15 p-4">
              <h3 className="text-sm font-semibold text-white">Usuarios com maior volume de saque</h3>
              <div className="mt-4 space-y-3">
                {repeatedUsers.length ? repeatedUsers.map((item) => (
                  <div key={`${item.name}-${item.total}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="rounded-full bg-white/10 px-2.5 py-1">{item.count} pedidos</span>
                      <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-amber-200">{formatCurrency(item.total)}</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-slate-400">Sem padrao recorrente relevante ate agora.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <h2 className="text-xl font-semibold text-white">Alertas prioritarios</h2>
            <p className="mt-1 text-sm text-slate-300">Saques altos e itens que merecem auditoria manual.</p>
            <div className="mt-5 space-y-3">
              {highValueAlerts.length ? highValueAlerts.map((item) => (
                <div key={item.id} className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
                  <p className="text-sm font-semibold text-white">{item.userDisplayName}</p>
                  <p className="mt-1 text-xs text-slate-200">{item.userEmail || 'Sem e-mail'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">{formatCurrency(item.amount)}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">{item.cpf || 'CPF não informado'}</span>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-slate-300">
                  Nenhum saque alto pendente no momento.
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Pedidos de saque</h2>
            <button
              onClick={() => void loadData()}
              className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
            >
              Atualizar
            </button>
          </div>

          {errorMessage && <p className="mb-4 text-sm text-red-600">{errorMessage}</p>}
          {feedbackMessage && <p className="mb-4 text-sm text-blue-700">{feedbackMessage}</p>}

          {data?.withdrawals?.length ? (
            <div className="space-y-3">
              {data.withdrawals.map((item) => {
                const isPending = item.status === 'pending';
                const isBusy = updatingId === item.id;

                return (
                  <div key={`${item.userId}-${item.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{item.userDisplayName}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.userEmail || 'Sem e-mail'}</p>
                        <p className="mt-1 text-sm text-slate-700">CPF: <span className="font-medium">{item.cpf || 'Não informado'}</span></p>
                        <p className="mt-1 text-xs text-slate-500">Solicitado em {formatDateTime(item.createdAt)}</p>
                        {item.status !== 'pending' && (
                          <p className="mt-1 text-xs text-slate-500">Processado por {item.decidedByEmail || 'admin'}</p>
                        )}
                      </div>

                      <div className="flex flex-col items-start gap-2 lg:items-end">
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          item.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.status === 'rejected'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}>
                          {item.status === 'approved' ? 'Aprovado' : item.status === 'rejected' ? 'Recusado' : 'Pendente'}
                        </span>
                        <div className="mt-1 flex gap-2">
                          <button
                            onClick={() => void decide(item, 'approved')}
                            disabled={!isPending || isBusy}
                            className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? 'Salvando...' : 'Aprovar'}
                          </button>
                          <button
                            onClick={() => void decide(item, 'rejected')}
                            disabled={!isPending || isBusy}
                            className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? 'Salvando...' : 'Recusar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-slate-600 py-8">Nenhum pedido de saque encontrado.</p>
          )}
        </div>
      </main>
    </div>
  );
}
