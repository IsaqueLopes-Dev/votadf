'use client';

import { useEffect, useState } from 'react';
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

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'isaquelopespires@gmail.com')
  .split(',')
  .map((e) => e.trim())
  .filter((e) => e);

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

        const nextTransactions = await fetchTransactions(session.access_token);
        setTransactionsData(nextTransactions);
        setErrorMessage('');
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        setErrorMessage(getErrorMessage(error));
        router.push('/auth');
      } finally {
        setLoading(false);
      }
    };

    void checkAuth();
  }, [router]);

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      {/* Header */}
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
            <h1 className="text-2xl font-bold text-white">Transações</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
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
