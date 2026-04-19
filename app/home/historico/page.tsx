'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

type BetHistoryItem = {
  id: string;
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  amount: number;
  potentialReturn: number;
  createdAt: string;
  status: 'aguardando' | 'ganhou' | 'perdeu';
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');

export default function HistoricoMobilePage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<BetHistoryItem[]>([]);
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

        const response = await fetch('/api/usuarios/bets-history', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json()) as { history?: BetHistoryItem[]; error?: string };

        if (!response.ok) {
          setError(payload.error || 'Não foi possível carregar histórico de apostas.');
          return;
        }

        setHistory(Array.isArray(payload.history) ? payload.history : []);
      } catch {
        setError('Não foi possível carregar histórico de apostas.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [router, supabase.auth]);

  const summary = useMemo(() => {
    return history.reduce(
      (acc, bet) => {
        acc.total += bet.amount;
        acc.potential += bet.potentialReturn;

        if (bet.status === 'ganhou') acc.wins += 1;
        if (bet.status === 'aguardando') acc.pending += 1;

        return acc;
      },
      { total: 0, potential: 0, wins: 0, pending: 0 }
    );
  }, [history]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#bfdbfe_0%,_#f8fafc_38%,_#ecfeff_100%)] px-4 py-5">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_-45px_rgba(15,23,42,0.45)]">
        <div className="bg-[linear-gradient(135deg,#111827_0%,#0f766e_48%,#2563eb_100%)] px-5 py-5 text-white sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">Mercados</p>
              <h1 className="mt-2 text-2xl font-bold">Histórico de apostas</h1>
              <p className="mt-2 max-w-xl text-sm text-cyan-50/85">
                Revise suas posições, retorno projetado e o status de cada entrada em um painel mais limpo.
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

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Apostado</p>
              <p className="mt-2 text-xl font-bold">{formatCurrency(summary.total)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Potencial</p>
              <p className="mt-2 text-xl font-bold">{formatCurrency(summary.potential)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Vitórias</p>
              <p className="mt-2 text-xl font-bold">{summary.wins}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/70">Aguardando</p>
              <p className="mt-2 text-xl font-bold">{summary.pending}</p>
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
              Você ainda não fez apostas.
            </div>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="space-y-3">
              {history.map((bet) => {
                const statusClasses =
                  bet.status === 'ganhou'
                    ? 'bg-emerald-100 text-emerald-700'
                    : bet.status === 'perdeu'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-700';

                return (
                  <div
                    key={bet.id}
                    className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.5)] sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{bet.votacaoTitulo}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Escolha: <span className="font-semibold text-slate-900">{bet.candidato}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(bet.createdAt)}</p>
                      </div>

                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClasses}`}>
                        {bet.status === 'ganhou'
                          ? 'Você ganhou'
                          : bet.status === 'perdeu'
                            ? 'Você perdeu'
                            : 'Aguardando resultado'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Valor apostado</p>
                        <p className="mt-2 text-lg font-bold text-slate-900">{formatCurrency(bet.amount)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Odd</p>
                        <p className="mt-2 text-lg font-bold text-slate-900">{bet.odd.toFixed(2)}x</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Retorno potencial</p>
                        <p className="mt-2 text-lg font-bold text-cyan-700">{formatCurrency(bet.potentialReturn)}</p>
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
