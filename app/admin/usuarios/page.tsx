'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../../utils/supabaseClient';
import UiverseLoader from '../../components/uiverse-loader';

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  username: string;
  role: string;
  cpf: string;
  birthDate: string;
  avatarUrl: string;
  balance: number;
  transactionCount: number;
  createdAt: string;
  lastSignInAt: string;
};

type UsersResponse = {
  users: UserRow[];
  error?: string;
};

const supabase = getSupabaseClient();

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const formatDateTime = (value: string) => {
  if (!value) return 'Sem registro';
  return new Date(value).toLocaleString('pt-BR');
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const router = useRouter();

  const loadUsers = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?next=/admin/usuarios');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const response = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json()) as UsersResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Erro ao carregar usuários.');
      }

      setUsers(payload.users || []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro inesperado ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const runAdminAction = async (
    userId: string,
    endpoint: string,
    body: Record<string, unknown>,
    successMessage: string
  ) => {
    try {
      setBusyUserId(userId);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Ação administrativa falhou.');
      }

      alert(payload.message || successMessage);
      await loadUsers();
    } catch (actionError) {
      alert(actionError instanceof Error ? actionError.message : 'Ação administrativa falhou.');
    } finally {
      setBusyUserId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return users;

    return users.filter((user) =>
      [user.displayName, user.username, user.email, user.cpf, user.role]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [search, users]);

  const totalBalance = filteredUsers.reduce((sum, user) => sum + user.balance, 0);
  const adminCount = filteredUsers.filter((user) => user.role === 'admin').length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <UiverseLoader label="Carregando usuários..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Voltar ao dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Usuários</h1>
            <p className="mt-1 text-sm text-slate-300">Visualize saldo, permissões e ações operacionais da conta.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="rounded-full border border-cyan-400/35 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
          >
            Atualizar
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[26px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-sm text-cyan-300">Usuários exibidos</p>
            <p className="mt-2 text-3xl font-bold text-white">{filteredUsers.length}</p>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-sm text-emerald-300">Saldo agregado</p>
            <p className="mt-2 break-words text-3xl font-bold text-white">{formatCurrency(totalBalance)}</p>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <p className="text-sm text-violet-300">Contas admin</p>
            <p className="mt-2 text-3xl font-bold text-white">{adminCount}</p>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] border border-white/10 bg-white/6 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Gestão de usuários</h2>
              <p className="mt-1 text-sm text-slate-300">Busque contas e execute ações diretamente no painel.</p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, email, CPF ou role"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 lg:max-w-sm"
            />
          </div>

          {error && <p className="mt-4 text-sm font-medium text-rose-300">Erro: {error}</p>}

          <div className="mt-6 space-y-4 md:hidden">
            {filteredUsers.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-black/15 p-5 text-sm text-slate-300">
                Nenhum usuário encontrado.
              </div>
            )}

            {filteredUsers.map((user) => {
              const isBusy = busyUserId === user.id;

              return (
                <div key={user.id} className="rounded-[26px] border border-white/10 bg-black/15 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{user.displayName || 'Sem identificação'}</p>
                      <p className="mt-1 text-xs text-slate-400">{user.username || user.id}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${
                        user.role === 'admin' ? 'bg-violet-400/15 text-violet-300' : 'bg-white/10 text-slate-200'
                      }`}
                    >
                      {user.role || 'user'}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">E-mail</span>
                      <span className="text-right text-slate-100">{user.email || 'Sem e-mail'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">CPF</span>
                      <span className="text-right text-slate-100">{user.cpf || 'Não informado'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">Saldo</span>
                      <span className="text-right font-semibold text-emerald-300">{formatCurrency(user.balance)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">PIX</span>
                      <span className="text-right text-slate-100">{user.transactionCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">Último acesso</span>
                      <span className="text-right text-slate-100">{formatDateTime(user.lastSignInAt || user.createdAt)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        const rawAmount = prompt(`Digite o ajuste de saldo para ${user.email || user.displayName}.\nUse valor positivo para crédito e negativo para débito.`);
                        if (!rawAmount) return;
                        const amount = Number(rawAmount.replace(',', '.'));
                        if (!Number.isFinite(amount) || amount === 0) {
                          alert('Informe um valor numérico diferente de zero.');
                          return;
                        }
                        const reason = prompt('Motivo do ajuste de saldo (opcional):') || '';
                        await runAdminAction(user.id, '/api/admin/users/adjust-balance', { userId: user.id, amount, reason }, 'Saldo ajustado com sucesso.');
                      }}
                      className="rounded-full border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-60"
                    >
                      Ajustar saldo
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        const newPassword = prompt(`Digite a nova senha para ${user.email}:`);
                        if (!newPassword) return;
                        await runAdminAction(user.id, '/api/admin/users/reset-password', { userId: user.id, newPassword }, 'Senha alterada com sucesso.');
                      }}
                      className="rounded-full border border-cyan-400/30 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/10 disabled:opacity-60"
                    >
                      Senha
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        const nextRole = user.role === 'admin' ? 'user' : 'admin';
                        const confirmed = window.confirm(`Deseja alterar a role de ${user.email || user.displayName} para ${nextRole}?`);
                        if (!confirmed) return;
                        await runAdminAction(user.id, '/api/admin/users/role', { userId: user.id, role: nextRole }, 'Role atualizada com sucesso.');
                      }}
                      className="rounded-full border border-violet-400/30 px-3 py-1.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-400/10 disabled:opacity-60"
                    >
                      {user.role === 'admin' ? 'Remover admin' : 'Tornar admin'}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        const confirmed = window.confirm(`Excluir a conta ${user.email || user.displayName}? Essa ação é irreversível.`);
                        if (!confirmed) return;
                        await runAdminAction(user.id, '/api/admin/users/delete', { userId: user.id }, 'Usuário excluído com sucesso.');
                      }}
                      className="rounded-full border border-rose-400/30 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-60"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1120px] text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-slate-400">
                  <th className="pb-3 pr-3 font-semibold">Usuário</th>
                  <th className="pb-3 pr-3 font-semibold">Contato</th>
                  <th className="pb-3 pr-3 font-semibold">Role</th>
                  <th className="pb-3 pr-3 font-semibold">Saldo</th>
                  <th className="pb-3 pr-3 font-semibold">PIX</th>
                  <th className="pb-3 pr-3 font-semibold">Último acesso</th>
                  <th className="pb-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}

                {filteredUsers.map((user) => {
                  const isBusy = busyUserId === user.id;

                  return (
                    <tr key={user.id} className="border-b border-slate-100 align-top">
                      <td className="py-4 pr-3">
                        <p className="text-sm font-semibold text-white">{user.displayName || 'Sem identificação'}</p>
                        <p className="mt-1 text-xs text-slate-400">{user.username || user.id}</p>
                        <p className="mt-2 text-xs text-slate-400">Criado em {formatDateTime(user.createdAt)}</p>
                      </td>
                      <td className="py-4 pr-3">
                        <p className="text-sm font-medium text-white">{user.email || 'Sem e-mail'}</p>
                        <p className="mt-1 text-xs text-slate-400">CPF: {user.cpf || 'Não informado'}</p>
                        <p className="mt-1 text-xs text-slate-400">Nascimento: {user.birthDate || 'Não informado'}</p>
                      </td>
                      <td className="py-4 pr-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            user.role === 'admin'
                              ? 'bg-violet-400/15 text-violet-300'
                              : 'bg-white/10 text-slate-200'
                          }`}
                        >
                          {user.role || 'user'}
                        </span>
                      </td>
                      <td className="py-4 pr-3">
                        <p className="text-sm font-semibold text-emerald-300">{formatCurrency(user.balance)}</p>
                      </td>
                      <td className="py-4 pr-3">
                        <p className="text-sm text-white">{user.transactionCount}</p>
                        <p className="mt-1 text-xs text-slate-400">crédito(s) registrados</p>
                      </td>
                      <td className="py-4 pr-3 text-sm text-slate-300">
                        {formatDateTime(user.lastSignInAt || user.createdAt)}
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              const rawAmount = prompt(
                                `Digite o ajuste de saldo para ${user.email || user.displayName}.\nUse valor positivo para crédito e negativo para débito.`
                              );

                              if (!rawAmount) return;

                              const amount = Number(rawAmount.replace(',', '.'));
                              if (!Number.isFinite(amount) || amount === 0) {
                                alert('Informe um valor numérico diferente de zero.');
                                return;
                              }

                              const reason = prompt('Motivo do ajuste de saldo (opcional):') || '';

                              await runAdminAction(
                                user.id,
                                '/api/admin/users/adjust-balance',
                                { userId: user.id, amount, reason },
                                'Saldo ajustado com sucesso.'
                              );
                            }}
                            className="rounded-full border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Ajustar saldo
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              const newPassword = prompt(`Digite a nova senha para ${user.email}:`);
                              if (!newPassword) return;

                              await runAdminAction(
                                user.id,
                                '/api/admin/users/reset-password',
                                { userId: user.id, newPassword },
                                'Senha alterada com sucesso.'
                              );
                            }}
                            className="rounded-full border border-cyan-400/30 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Redefinir senha
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              const nextRole = user.role === 'admin' ? 'user' : 'admin';
                              const confirmed = window.confirm(
                                `Deseja alterar a role de ${user.email || user.displayName} para ${nextRole}?`
                              );

                              if (!confirmed) return;

                              await runAdminAction(
                                user.id,
                                '/api/admin/users/role',
                                { userId: user.id, role: nextRole },
                                'Role atualizada com sucesso.'
                              );
                            }}
                            className="rounded-full border border-violet-400/30 px-3 py-1.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {user.role === 'admin' ? 'Remover admin' : 'Tornar admin'}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              const confirmed = window.confirm(
                                `Excluir a conta ${user.email || user.displayName}? Essa ação é irreversível.`
                              );

                              if (!confirmed) return;

                              await runAdminAction(
                                user.id,
                                '/api/admin/users/delete',
                                { userId: user.id },
                                'Usuário excluído com sucesso.'
                              );
                            }}
                            className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Excluir usuário
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
