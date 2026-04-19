'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

type TransactionRecord = {
  id: string;
  email: string;
  displayName: string;
  balance: number;
  transactionCount: number;
  lastPixCreditAt: string;
  creditedPixPaymentIds: string[];
  createdAt: string;
};

type TransactionsResponse = {
  transactions: TransactionRecord[];
  totals: {
    totalTransactions: number;
    totalBalance: number;
    activeAccounts: number;
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

const fetchTransactions = async (accessToken: string) => {
  const response = await fetch('/api/admin/transactions', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível carregar as transações.');
  }

  return data as TransactionsResponse;
};

export default function TransacoesPage() {
  const [loading, setLoading] = useState(true);
  const [transactionsData, setTransactionsData] = useState<TransactionsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const router = useRouter();

  const topBalances = useMemo(
    () => [...(transactionsData?.transactions || [])].sort((a, b) => b.balance - a.balance).slice(0, 5),
    [transactionsData?.transactions]
  );

  const suspiciousAccounts = useMemo(
    () =>
      (transactionsData?.transactions || [])
        .filter((item) => item.transactionCount >= 5 || item.creditedPixPaymentIds.length >= 3 || item.balance >= 1000)
        .slice(0, 5),
    [transactionsData?.transactions]
  );

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

        const nextTransactions = await fetchTransactions(session.access_token);
        setTransactionsData(nextTransactions);
        setErrorMessage('');
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
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
      void loadTransactions();
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const loadTransactions = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const nextTransactions = await fetchTransactions(session.access_token);
      setTransactionsData(nextTransactions);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
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
      {/* Header */}
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
            <h1 className="text-2xl font-bold text-white">Transações</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-blue-700">Créditos PIX contabilizados</p>
            <p className="mt-2 text-3xl font-bold text-blue-900">{transactionsData?.totals.totalTransactions ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-emerald-700">Saldo total dos usuários com movimentação</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{formatCurrency(transactionsData?.totals.totalBalance ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Contas com histórico</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{transactionsData?.totals.activeAccounts ?? 0}</p>
          </div>
        </section>

        <section className="mb-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <h2 className="text-xl font-semibold text-white">Visao financeira</h2>
            <p className="mt-1 text-sm text-slate-300">Concentracao de saldo, recorrencia de creditos e contas-chave.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Maior saldo</p>
                <p className="mt-3 text-2xl font-bold text-white">{formatCurrency(topBalances[0]?.balance ?? 0)}</p>
                <p className="mt-1 text-sm text-slate-300">{topBalances[0]?.displayName || 'Sem conta destacada'}</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Contas monitoradas</p>
                <p className="mt-3 text-2xl font-bold text-white">{suspiciousAccounts.length}</p>
                <p className="mt-1 text-sm text-slate-300">com alto volume ou saldo relevante</p>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <h2 className="text-xl font-semibold text-white">Alertas operacionais</h2>
            <p className="mt-1 text-sm text-slate-300">Sinais de contas com saldo alto ou movimento atipico.</p>
            <div className="mt-5 space-y-3">
              {suspiciousAccounts.length ? suspiciousAccounts.map((item) => (
                <div key={item.id} className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                  <p className="text-sm font-semibold text-white">{item.displayName}</p>
                  <p className="mt-1 text-xs text-slate-200">{item.email || 'Sem e-mail'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">{formatCurrency(item.balance)}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">{item.transactionCount} transacoes</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-100">{item.creditedPixPaymentIds.length} IDs</span>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-slate-300">
                  Sem sinais operacionais relevantes neste momento.
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Histórico de Transações</h2>
              <p className="mt-1 text-sm text-slate-500">Resumo derivado dos créditos PIX já registrados no metadata dos usuários.</p>
            </div>
            <button
              onClick={() => void loadTransactions()}
              className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
            >
              Atualizar
            </button>
          </div>

          {errorMessage && <p className="mb-4 text-sm text-red-600">{errorMessage}</p>}

          {transactionsData?.transactions?.length ? (
            <div className="space-y-3">
              {transactionsData.transactions.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">PIX</span>
                        <p className="font-semibold text-slate-900">{item.displayName}</p>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{item.email || 'Sem e-mail'} </p>
                      <p className="mt-1 text-sm text-slate-600">{item.transactionCount} pagamento(s) aprovado(s) registrado(s)</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Saldo atual</p>
                        <p className="mt-2 text-lg font-bold text-blue-700">{formatCurrency(item.balance)}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Último crédito</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(item.lastPixCreditAt)}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">IDs rastreados</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{item.creditedPixPaymentIds.slice(0, 2).join(', ') || 'Sem IDs'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 text-center py-8">Nenhuma transação registrada ainda</p>
          )}
        </div>
      </main>
    </div>
  );
}
