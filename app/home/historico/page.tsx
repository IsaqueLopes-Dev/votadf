'use client';

import { useEffect, useState } from 'react';
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
  }, [router]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_42%,_#f8fafc_100%)] px-3 py-4" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-blue-100 bg-white shadow-xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-3 py-3 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Área do usuário</p>
            <h1 className="mt-0.5 text-sm font-bold">Histórico de apostas</h1>
          </div>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="rounded-md border border-white/30 px-2 py-1 text-xs font-semibold text-white transition hover:bg-white/15"
          >
            Voltar
          </button>
        </div>

        <div className="p-2.5">
          {loading && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Carregando histórico...</p>}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600">
              Você ainda não fez apostas.
            </div>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="space-y-2">
              {history.map((bet) => (
                <div key={bet.id} className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <div className="flex flex-col gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{bet.votacaoTitulo}</p>
                      <p className="mt-1 text-xs text-slate-600">Candidato: <span className="font-medium">{bet.candidato}</span></p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(bet.createdAt).toLocaleString('pt-BR')}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">Aposta</p>
                        <p className="font-semibold text-slate-800">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bet.amount)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500">Retorno potencial</p>
                        <p className="font-bold text-cyan-700">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(bet.potentialReturn)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <span className="text-xs text-slate-500">Cotação {bet.odd.toFixed(2)}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        bet.status === 'ganhou'
                          ? 'bg-emerald-100 text-emerald-700'
                          : bet.status === 'perdeu'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {bet.status === 'ganhou'
                        ? 'Você ganhou'
                        : bet.status === 'perdeu'
                          ? 'Você perdeu'
                          : 'Aguardando resultado'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
