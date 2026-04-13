'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

type AdminUserRecord = {
  id: string;
  email: string;
  displayName: string;
  username: string;
  cpf: string;
  birthDate: string;
  avatarUrl: string;
  balance: number;
  transactionCount: number;
  lastPixCreditAt: string;
  createdAt: string;
  lastSignInAt: string;
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

const fetchUsers = async (accessToken: string) => {
  const response = await fetch('/api/admin/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível carregar os usuários.');
  }

  return (data.users || []) as AdminUserRecord[];
};

type ResetModalState = {
  userId: string;
  displayName: string;
};

type BalanceModalState = {
  userId: string;
  displayName: string;
};

export default function UsuariosPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetModal, setResetModal] = useState<ResetModalState | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [balanceModal, setBalanceModal] = useState<BalanceModalState | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [balanceSuccess, setBalanceSuccess] = useState(false);
  const router = useRouter();

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

        const nextUsers = await fetchUsers(session.access_token);
        setUsers(nextUsers);
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

  const openResetModal = (user: AdminUserRecord) => {
    setResetModal({ userId: user.id, displayName: user.displayName });
    setNewPassword('');
    setResetError('');
    setResetSuccess(false);
  };

  const closeResetModal = () => {
    setResetModal(null);
    setNewPassword('');
    setResetError('');
    setResetSuccess(false);
  };

  const openBalanceModal = (user: AdminUserRecord) => {
    setBalanceModal({ userId: user.id, displayName: user.displayName });
    setBalanceAmount('');
    setBalanceReason('');
    setBalanceError('');
    setBalanceSuccess(false);
  };

  const closeBalanceModal = () => {
    setBalanceModal(null);
    setBalanceAmount('');
    setBalanceReason('');
    setBalanceError('');
    setBalanceSuccess(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModal) return;
    setResetLoading(true);
    setResetError('');
    setResetSuccess(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const response = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: resetModal.userId, newPassword }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao redefinir senha.');
      }

      setResetSuccess(true);
    } catch (error) {
      setResetError(getErrorMessage(error));
    } finally {
      setResetLoading(false);
    }
  };

  const handleAddBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceModal) return;

    const amount = Number(balanceAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBalanceError('Digite um valor válido maior que zero.');
      return;
    }

    setBalanceLoading(true);
    setBalanceError('');
    setBalanceSuccess(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const response = await fetch('/api/admin/users/add-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: balanceModal.userId,
          amount,
          reason: balanceReason,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao adicionar saldo.');
      }

      setBalanceSuccess(true);
      await loadUsers();
    } catch (error) {
      setBalanceError(getErrorMessage(error));
    } finally {
      setBalanceLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Sessão administrativa não encontrada.');
      }

      const nextUsers = await fetchUsers(session.access_token);
      setUsers(nextUsers);
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
        <div className="flex w-full items-center gap-4 py-4">
          <Link href="/admin" className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Administração</p>
            <h1 className="text-2xl font-bold text-white">Usuários</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-0 py-6 sm:py-10">
        <section className="mb-6 rounded-3xl border border-blue-100 bg-white/95 p-6 shadow-sm backdrop-blur">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-sm text-blue-700">Total de usuários</p>
              <p className="mt-2 text-3xl font-bold text-blue-900">{users.length}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">Com saldo positivo</p>
              <p className="mt-2 text-3xl font-bold text-emerald-900">{users.filter((item) => item.balance > 0).length}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-sm text-slate-600">Último cadastro</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{users[0] ? formatDateTime(users[0].createdAt) : 'Sem registros'}</p>
            </div>
          </div>
        </section>

        <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Lista de Usuários</h2>
            <button
              onClick={() => void loadUsers()}
              className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
            >
              Atualizar
            </button>
          </div>

          {errorMessage && <p className="mb-4 text-sm text-red-600">{errorMessage}</p>}

          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-3 py-3">Usuário</th>
                    <th className="px-3 py-3">Cadastro</th>
                    <th className="px-3 py-3">Último acesso</th>
                    <th className="px-3 py-3">Saldo</th>
                    <th className="px-3 py-3">Créditos PIX</th>
                    <th className="px-3 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((item) => (
                    <tr key={item.id} className="align-top text-sm text-slate-700">
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                            {item.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.avatarUrl} alt={item.displayName} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-sm font-semibold text-slate-500">{item.displayName.slice(0, 1).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{item.displayName}</p>
                            <p className="text-xs text-slate-500">{item.email || 'Sem e-mail'}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.cpf ? `CPF: ${item.cpf}` : 'CPF não informado'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <p>{formatDateTime(item.createdAt)}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.username || 'Sem @username'}</p>
                      </td>
                      <td className="px-3 py-4">
                        <p>{formatDateTime(item.lastSignInAt)}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.birthDate || 'Data de nascimento não informada'}</p>
                      </td>
                      <td className="px-3 py-4 font-semibold text-blue-700">{formatCurrency(item.balance)}</td>
                      <td className="px-3 py-4">
                        <p className="font-semibold text-slate-900">{item.transactionCount}</p>
                        <p className="mt-1 text-xs text-slate-500">Último crédito: {formatDateTime(item.lastPixCreditAt)}</p>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openResetModal(item)}
                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                          >
                            Alterar senha
                          </button>
                          <button
                            onClick={() => openBalanceModal(item)}
                            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Adicionar saldo
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-slate-600 py-8">Nenhum usuário registrado ainda</p>
          )}
        </div>
      </main>

      {/* Modal Redefinir Senha */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Redefinir senha</h3>
            <p className="mt-1 text-sm text-slate-500">
              Usuário: <span className="font-semibold text-slate-700">{resetModal.displayName}</span>
            </p>

            {resetSuccess ? (
              <div className="mt-6">
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  Senha redefinida com sucesso!
                </p>
                <button
                  onClick={closeResetModal}
                  className="mt-4 w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => void handleResetPassword(e)} className="mt-6 flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Nova senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    minLength={8}
                    required
                    className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {resetError && (
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{resetError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="flex-1 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {resetLoading ? 'Salvando...' : 'Confirmar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Adicionar Saldo */}
      {balanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Adicionar saldo</h3>
            <p className="mt-1 text-sm text-slate-500">
              Usuário: <span className="font-semibold text-slate-700">{balanceModal.displayName}</span>
            </p>

            {balanceSuccess ? (
              <div className="mt-6">
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  Saldo adicionado com sucesso!
                </p>
                <button
                  onClick={closeBalanceModal}
                  className="mt-4 w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => void handleAddBalance(e)} className="mt-6 flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Valor</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    placeholder="Ex.: 50.00"
                    required
                    className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Motivo (opcional)</label>
                  <input
                    type="text"
                    value={balanceReason}
                    onChange={(e) => setBalanceReason(e.target.value)}
                    placeholder="Ex.: ajuste manual"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {balanceError && (
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{balanceError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeBalanceModal}
                    className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={balanceLoading}
                    className="flex-1 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {balanceLoading ? 'Salvando...' : 'Confirmar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
