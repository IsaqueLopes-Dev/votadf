'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, type User } from '@supabase/supabase-js';
import Link from 'next/link';

type DashboardData = {
  stats: {
    totalVotacoes: number;
    activeVotacoes: number;
    totalUsuarios: number;
    usersWithBalance: number;
    totalTransactions: number;
    totalBalance: number;
  };
  recentActivity: Array<{
    id: string;
    type: 'votacao' | 'deposito';
    title: string;
    description: string;
    createdAt: string;
  }>;
};

type BetTotalsData = {
  totalWonValue: number;
  totalLostValue: number;
};

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

const formatDateTime = (value: string) => {
  if (!value) return 'Sem data';
  return new Date(value).toLocaleString('pt-BR');
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Erro inesperado.';
};

const fetchDashboardData = async (accessToken: string) => {
  const response = await fetch('/api/admin/dashboard', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível carregar o dashboard.');
  }

  return data as DashboardData;
};

const fetchBetTotals = async (accessToken: string) => {
  const response = await fetch('/api/admin/bets', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível carregar os totais de apostas.');
  }

  const totals = (data?.totals || {}) as Record<string, unknown>;
  return {
    totalWonValue: Number(totals.totalWonValue || 0),
    totalLostValue: Number(totals.totalLostValue || 0),
  } as BetTotalsData;
};

export default function AdminDashboard() {
const [user, setUser] = useState<User | null>(null);
const [loading, setLoading] = useState(true);
const [isAuthorized, setIsAuthorized] = useState(false);
const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [betTotals, setBetTotals] = useState<BetTotalsData | null>(null);
  const [dashboardError, setDashboardError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?next=/admin');
          return;
        }

        setUser(user);

       useEffect(() => {
  const checkAuth = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?next=/admin');
        return;
      }

      setUser(user);

      // 🔥 AQUI ENTRA O CHECK DE ADMIN
      const session = await supabase.auth.getSession();

      if (!session.data.session?.access_token) {
        router.push('/login?next=/admin');
        return;
      }

      const checkRes = await fetch('/api/admin/check', {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
      });

      if (!checkRes.ok) {
        setIsAuthorized(false);
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
      console.error('Erro auth admin:', error);
      setIsAuthorized(false);
    }
  };

  checkAuth();
}, []);
        const [data, totals] = await Promise.all([
          fetchDashboardData(session.access_token),
          fetchBetTotals(session.access_token),
        ]);
        setDashboardData(data);
        setBetTotals(totals);
        setDashboardError('');
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        setDashboardError(getErrorMessage(error));
        router.push('/login?next=/admin');
      } finally {
        setLoading(false);
      }
    };

    void checkAuth();
  }, [router]);

  const loadDashboard = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const [data, totals] = await Promise.all([
        fetchDashboardData(session.access_token),
        fetchBetTotals(session.access_token),
      ]);
      setDashboardData(data);
      setBetTotals(totals);
      setDashboardError('');
    } catch (error) {
      setDashboardError(getErrorMessage(error));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login?next=/admin');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50 flex items-center justify-center" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
        <div className="text-slate-600">Carregando...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50 flex flex-col items-center justify-center p-4" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
        <div className="rounded-3xl border border-red-200 bg-red-50 p-10 max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-900 mb-4">Acesso Negado</h1>
          <p className="text-red-700 mb-6">
            Você não tem permissão para acessar o painel de administrador.
            {user?.email && <span><br />Email: {user.email}</span>}
          </p>
          <button
            onClick={handleLogout}
            className="rounded-full bg-red-600 px-6 py-2 text-white transition hover:bg-red-700 w-full"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      {/* Header */}
      <header className="bg-blue-600 shadow-md">
        <div className="flex w-full items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Administracao</p>
            <h1 className="text-2xl font-bold text-white">Painel Admin - VotaDF</h1>
            {user?.email && (
              <p className="mt-1 text-xs text-blue-100">Admin logado: <span className="font-semibold">{user.email}</span></p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-white transition hover:bg-white/20 font-medium"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-0 py-6 sm:py-10">
        <section className="mb-8 rounded-3xl border border-blue-100 bg-white/95 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm font-medium text-blue-700">Gerencie votações, usuários e transações em um único lugar.</p>
            <div className="flex flex-wrap items-center gap-3">
              {dashboardData && (
                <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  Saldo total acompanhado no painel: <span className="font-semibold">{formatCurrency(dashboardData.stats.totalBalance)}</span>
                </div>
              )}
              <button
                onClick={() => void loadDashboard()}
                className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
              >
                Atualizar painel
              </button>
            </div>
          </div>
          {dashboardError && <p className="mt-3 text-sm text-red-600">{dashboardError}</p>}
        </section>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5 mb-10">
          {/* Card: Votações */}
          <Link
            href="/admin/votacoes"
            className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm hover:shadow-md transition hover:border-blue-300"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-.094 4H2.094A2 2 0 012 14V6zm4 3a1 1 0 000 2h4a1 1 0 000-2H6zm0 4a1 1 0 000 2h4a1 1 0 000-2H6z" />
              </svg>
              <h2 className="text-lg font-semibold text-slate-900">Votações</h2>
            </div>
            <p className="text-slate-600 text-sm">Gerenciar votações ativas e criar novas</p>
            <div className="mt-4 text-3xl font-bold text-blue-600">{dashboardData?.stats.totalVotacoes ?? '-'}</div>
            <p className="mt-1 text-xs text-slate-500">{dashboardData?.stats.activeVotacoes ?? 0} ativas agora</p>
          </Link>

          {/* Card: Usuários */}
          <Link
            href="/admin/usuarios"
            className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm hover:shadow-md transition hover:border-blue-300"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.5 1.5H5.75A2.25 2.25 0 003.5 3.75v12.5A2.25 2.25 0 005.75 18.5h8.5a2.25 2.25 0 002.25-2.25V9M10.5 1.5v6h6m-6-6l6 6" />
              </svg>
              <h2 className="text-lg font-semibold text-slate-900">Usuários</h2>
            </div>
            <p className="text-slate-600 text-sm">Visualizar e gerenciar usuários</p>
            <div className="mt-4 text-3xl font-bold text-blue-600">{dashboardData?.stats.totalUsuarios ?? '-'}</div>
            <p className="mt-1 text-xs text-slate-500">{dashboardData?.stats.usersWithBalance ?? 0} com saldo positivo</p>
          </Link>

          {/* Card: Transações */}
          <Link
            href="/admin/transacoes"
            className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm hover:shadow-md transition hover:border-blue-300"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm12 4a2 2 0 012 2v4a2 2 0 01-2 2h-2.5a1 1 0 01-.82-.4l-1.4-1.867a1 1 0 00-.82-.4H8a2 2 0 01-2-2v-4a2 2 0 012-2h8z" />
              </svg>
              <h2 className="text-lg font-semibold text-slate-900">Transações</h2>
            </div>
            <p className="text-slate-600 text-sm">Histórico de movimentações financeiras</p>
            <div className="mt-4 text-3xl font-bold text-blue-600">{dashboardData?.stats.totalTransactions ?? '-'}</div>
            <p className="mt-1 text-xs text-slate-500">créditos PIX registrados</p>
          </Link>

          {/* Card: Apostas */}
          <Link
            href="/admin/apostas"
            className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm hover:shadow-md transition hover:border-blue-300"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V7.414a1 1 0 00-.293-.707l-2.414-2.414A1 1 0 0013.586 4H4zm8 1.5V8h2.5L12 5.5zM6 11a1 1 0 100 2h8a1 1 0 100-2H6zm0 3a1 1 0 100 2h6a1 1 0 100-2H6z" />
              </svg>
              <h2 className="text-lg font-semibold text-slate-900">Apostas</h2>
            </div>
            <p className="text-slate-600 text-sm">Definir manualmente quem ganhou e perdeu</p>
            <div className="mt-4 text-3xl font-bold text-blue-600">Manual</div>
            <p className="mt-1 text-xs text-slate-500">liquidação individual por aposta</p>
          </Link>

          {/* Card: Saques */}
          <Link
            href="/admin/saques"
            className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm hover:shadow-md transition hover:border-blue-300"
          >
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zm6.5 2a.75.75 0 00-1.5 0V10H6.75a.75.75 0 000 1.5H8v1.5a.75.75 0 001.5 0v-1.5h1.25a.75.75 0 000-1.5H9.5V6.5z" />
              </svg>
              <h2 className="text-lg font-semibold text-slate-900">Saques</h2>
            </div>
            <p className="text-slate-600 text-sm">Aprovar ou recusar solicitações de saque</p>
            <div className="mt-4 text-3xl font-bold text-blue-600">Pedidos</div>
            <p className="mt-1 text-xs text-slate-500">processamento manual por CPF</p>
          </Link>
        </div>

        <section className="mb-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-emerald-700">Valor em ganhos</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{formatCurrency(betTotals?.totalWonValue ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500">somatório das apostas marcadas como ganhou</p>
          </div>
          <div className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-rose-700">Valor em perdas</p>
            <p className="mt-2 text-3xl font-bold text-rose-900">{formatCurrency(betTotals?.totalLostValue ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500">somatório das apostas marcadas como perdeu</p>
          </div>
        </section>

        {/* Recent Activity */}
        <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Atividade Recente</h2>
          {dashboardData?.recentActivity?.length ? (
            <div className="space-y-3">
              {dashboardData.recentActivity.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        item.type === 'deposito' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {item.type === 'deposito' ? 'PIX' : 'Votação'}
                      </span>
                      <p className="font-medium text-slate-900">{item.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-500">{formatDateTime(item.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 text-center py-8">Nenhuma atividade registrada ainda</p>
          )}
        </section>
      </main>
    </div>
  );
}
