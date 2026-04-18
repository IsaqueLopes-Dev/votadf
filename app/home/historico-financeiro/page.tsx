'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

type FinancialHistoryItem = {
  id: string;
  tipo: 'deposito' | 'saque';
  status: 'aprovado' | 'pendente' | 'recusado';
  amount: number;
  createdAt: string;
  cpf?: string;
  paymentId?: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');

export default function HistoricoFinanceiroMobilePage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<FinancialHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const run = async () => {
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
          setError('Sessão inválida. Faça login novamente.');
          return;
        }

        const response = await fetch('/api/usuarios/financial-history', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json()) as { history?: FinancialHistoryItem[]; error?: string };

        if (!response.ok) {
          setError(payload.error || 'Não foi possível carregar histórico financeiro.');
          return;
        }

        setHistory(Array.isArray(payload.history) ? payload.history : []);
      } catch {
        setError('Não foi possível carregar histórico financeiro.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [router, supabase.auth]);

  const summary = useMemo(() => {
    return history.reduce(
      (acc, item) => {
        if (item.tipo === 'deposito') {
          acc.deposits += item.amount;
        } else {
          acc.withdrawals += item.amount;
        }

        if (item.status === 'pendente') {
          acc.pending += 1;
        }

        return acc;
      },
      { deposits: 0, withdrawals: 0, pending: 0 }
    );
  }, [history]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#d9f99d_0%,_#f8fafc_38%,_#eef2ff_100%)] px-4 py-5">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_-45px_rgba(15,23,42,0.45)]">
        <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_58%,#22c55e_100%)] px-5 py-5 text-white sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">Carteira</p>
              <h1 className="mt-2 text-2xl font-bold">Histórico financeiro</h1>
              <p className="mt-2 max-w-xl text-sm text-blue-50/85">
                Acompanhe depósitos PIX e solicitações de saque com uma visão mais clara do fluxo da sua conta.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/home')}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Voltar
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-100/70">Entradas</p>
              <p className="mt-2 text-2xl font-bold">{formatCurrency(summary.deposits)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-100/70">Saídas</p>
              <p className="mt-2 text-2xl font-bold">{formatCurrency(summary.withdrawals)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-100/70">Pendências</p>
              <p className="mt-2 text-2xl font-bold">{summary.pending}</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {loading && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              Carregando histórico...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
              {error}
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
              Você ainda não possui histórico de depósitos ou saques.
            </div>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="space-y-3">
              {history.map((item) => {
                const isDeposit = item.tipo === 'deposito';
                const statusClasses =
                  item.status === 'aprovado'
                    ? 'bg-emerald-100 text-emerald-700'
                    : item.status === 'recusado'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-700';

                return (
                  <div
                    key={item.id}
                    className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.5)] sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                            isDeposit ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {isDeposit ? '+' : '-'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {isDeposit ? 'Depósito PIX' : 'Solicitação de saque'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(item.createdAt)}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className={`text-base font-bold ${isDeposit ? 'text-emerald-700' : 'text-slate-900'}`}>
                          {isDeposit ? '+' : '-'}
                          {formatCurrency(item.amount)}
                        </p>
                        <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClasses}`}>
                          {item.status === 'aprovado'
                            ? 'Aprovado'
                            : item.status === 'recusado'
                              ? 'Recusado'
                              : 'Pendente'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2">
                      <div>
                        <p className="font-semibold text-slate-800">Tipo</p>
                        <p className="mt-1">{isDeposit ? 'Entrada via PIX' : 'Saída para o CPF cadastrado'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{isDeposit ? 'Pagamento' : 'CPF de destino'}</p>
                        <p className="mt-1 break-all">{isDeposit ? item.paymentId || 'PIX confirmado' : item.cpf || 'Não informado'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
