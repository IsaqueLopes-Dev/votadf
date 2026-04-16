'use client';

import { useEffect, useState } from 'react';
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
  }, [router]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_42%,_#f8fafc_100%)] px-3 py-4" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-blue-100 bg-white shadow-xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-3 py-3 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Área financeira</p>
            <h1 className="mt-0.5 text-sm font-bold">Histórico financeiro</h1>
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
              Você ainda não possui histórico de depósitos ou saques.
            </div>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        {item.tipo === 'deposito' ? 'Depósito PIX' : 'Solicitação de saque'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                    <p className={`text-sm font-bold ${item.tipo === 'deposito' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {item.tipo === 'deposito' ? '+' : '-'}
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.status === 'aprovado'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.status === 'recusado'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {item.status === 'aprovado'
                        ? 'Aprovado'
                        : item.status === 'recusado'
                          ? 'Recusado'
                          : 'Pendente'}
                    </span>
                    {item.tipo === 'saque' && item.cpf && (
                      <span className="text-xs text-slate-500">CPF: {item.cpf}</span>
                    )}
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
