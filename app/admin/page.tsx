'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, type User } from '@supabase/supabase-js';

type DashboardResponse = {
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
  error?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const adminSections = [
  { href: '/admin/votacoes', title: 'Votações', description: 'Criar, editar, ativar e excluir mercados.' },
  { href: '/admin/usuarios', title: 'Usuários', description: 'Ver saldo, ajustar saldo, redefinir senha e remover acesso.' },
  { href: '/admin/transacoes', title: 'Transações', description: 'Acompanhar créditos PIX e histórico financeiro.' },
  { href: '/admin/apostas', title: 'Apostas', description: 'Liquidar apostas e acompanhar exposição da plataforma.' },
  { href: '/admin/saques', title: 'Saques', description: 'Aprovar ou recusar solicitações de saque.' },
] as const;

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const allowedAdminEmail = 'isaquelopespires@gmail.com';

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?next=/admin');
          return;
        }

        // Verifica se o e-mail é o permitido
        if (user.email !== allowedAdminEmail) {
          setError('Acesso restrito: este painel é exclusivo para administradores.');
          setLoading(false);
          return;
        }

        setUser(user);

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error('Sessão administrativa não encontrada.');
        }

        const response = await fetch('/api/admin/dashboard', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json()) as DashboardResponse;

        if (!response.ok) {
          throw new Error(payload.error || 'Não foi possível carregar o dashboard admin.');
        }

        setDashboard(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o dashboard admin.');
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleSwitchAccount = async () => {
    await supabase.auth.signOut();
    router.push('/login?next=/admin&switch=1');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-slate-600">Carregando painel admin...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Painel admin indisponível</h1>
          <p className="mt-3 text-sm text-slate-600">{error}</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="rounded-full border border-blue-300 px-5 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              Trocar conta
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#dbeafe_0%,#eff6ff_22%,#f8fafc_100%)]">
      <header className="border-b border-blue-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Administração</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Painel de controle</h1>
            <p className="mt-1 text-sm text-slate-600">
              {user?.email ? `Logado como ${user.email}` : 'Gestão completa da operação.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/home"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Ir para o app
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-[28px] border border-blue-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-blue-700">Votações cadastradas</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{dashboard?.stats.totalVotacoes ?? 0}</p>
            <p className="mt-2 text-sm text-slate-500">{dashboard?.stats.activeVotacoes ?? 0} ativas no momento</p>
          </div>
          <div className="rounded-[28px] border border-emerald-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-emerald-700">Usuários com saldo</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{dashboard?.stats.usersWithBalance ?? 0}</p>
            <p className="mt-2 text-sm text-slate-500">De {dashboard?.stats.totalUsuarios ?? 0} contas cadastradas</p>
          </div>
          <div className="rounded-[28px] border border-cyan-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-cyan-700">Saldo total em conta</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(dashboard?.stats.totalBalance ?? 0)}</p>
            <p className="mt-2 text-sm text-slate-500">{dashboard?.stats.totalTransactions ?? 0} créditos PIX registrados</p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-blue-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Áreas de gestão</h2>
                <p className="mt-1 text-sm text-slate-500">Tudo que você precisa para operar a plataforma.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {adminSections.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-blue-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Atividade recente</h2>
            <p className="mt-1 text-sm text-slate-500">Últimos eventos rastreados pelo painel.</p>

            <div className="mt-5 space-y-3">
              {dashboard?.recentActivity?.length ? (
                dashboard.recentActivity.map((activity) => (
                  <div key={activity.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          activity.type === 'deposito'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {activity.type === 'deposito' ? 'Depósito' : 'Votação'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(activity.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{activity.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{activity.description}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Nenhuma atividade recente encontrada.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
