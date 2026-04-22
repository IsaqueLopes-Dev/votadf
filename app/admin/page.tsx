'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, type User } from '@supabase/supabase-js';
import UiverseLoader from '../components/uiverse-loader';

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
  { href: '/admin/banners', title: 'Banners', description: 'Gerenciar o banner da home com versões desktop e mobile.' },
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
      <div className="flex min-h-screen items-center justify-center px-4">
        <UiverseLoader label="Carregando painel admin..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,17,0.92)_0%,rgba(14,18,28,0.94)_100%)] p-8 shadow-[0_25px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <h1 className="text-2xl font-bold text-white">Painel admin indisponível</h1>
          <p className="mt-3 text-sm text-slate-300">{error}</p>
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
              className="rounded-full border border-cyan-400/35 px-5 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
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
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Administração</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Painel de controle</h1>
            <p className="mt-1 text-sm text-slate-300">
              {user?.email ? `Logado como ${user.email}` : 'Gestão completa da operação.'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/home"
              className="rounded-full border border-white/12 px-4 py-2.5 text-center text-sm font-semibold text-slate-200 transition hover:bg-white/5"
            >
              Voltar para o site
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-[linear-gradient(135deg,#00c3ff,#0099cc)] px-4 py-2.5 text-sm font-semibold text-[#03111f] transition hover:brightness-105"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <p className="text-sm text-cyan-300">Votações cadastradas</p>
            <p className="mt-2 text-3xl font-bold text-white">{dashboard?.stats.totalVotacoes ?? 0}</p>
            <p className="mt-2 text-sm text-slate-300">{dashboard?.stats.activeVotacoes ?? 0} ativas no momento</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <p className="text-sm text-emerald-300">Usuários com saldo</p>
            <p className="mt-2 text-3xl font-bold text-white">{dashboard?.stats.usersWithBalance ?? 0}</p>
            <p className="mt-2 text-sm text-slate-300">De {dashboard?.stats.totalUsuarios ?? 0} contas cadastradas</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <p className="text-sm text-sky-300">Saldo total em conta</p>
            <p className="mt-2 text-3xl font-bold text-white">{formatCurrency(dashboard?.stats.totalBalance ?? 0)}</p>
            <p className="mt-2 text-sm text-slate-300">{dashboard?.stats.totalTransactions ?? 0} créditos PIX registrados</p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Áreas de gestão</h2>
                <p className="mt-1 text-sm text-slate-300">Tudo que você precisa para operar a plataforma.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {adminSections.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.04)_100%)] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/10"
                >
                  <h3 className="text-lg font-semibold text-white">{section.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{section.description}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <h2 className="text-xl font-semibold text-white">Atividade recente</h2>
            <p className="mt-1 text-sm text-slate-300">Últimos eventos rastreados pelo painel.</p>

            <div className="mt-5 space-y-3">
              {dashboard?.recentActivity?.length ? (
                dashboard.recentActivity.map((activity) => (
                  <div key={activity.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          activity.type === 'deposito'
                            ? 'bg-emerald-400/15 text-emerald-300'
                            : 'bg-cyan-400/15 text-cyan-300'
                        }`}
                      >
                        {activity.type === 'deposito' ? 'Depósito' : 'Votação'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(activity.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">{activity.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{activity.description}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-slate-300">
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
