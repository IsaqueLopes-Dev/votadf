'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../../utils/supabaseClient';

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  username: string;
  role: string;
  balance: number;
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

async function resetPassword(userId: string, userEmail: string, accessToken: string) {
  const newPassword = prompt(`Digite a nova senha para o usuário ${userEmail}:`);

  if (!newPassword) return;

  const response = await fetch('/api/admin/users/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ userId, newPassword }),
  });

  const payload = (await response.json()) as { success?: boolean; error?: string };

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Erro ao alterar senha.');
  }
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadUsers = async () => {
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
        const message =
          loadError instanceof Error ? loadError.message : 'Erro inesperado ao carregar usuários.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadUsers();
  }, [router]);

  if (loading) {
    return <div className="p-6 text-gray-600">Carregando usuários...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600 font-semibold">Erro: {error}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Painel de Usuários</h1>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-blue-100">
            <tr>
              <th className="p-3 text-blue-900">Usuário</th>
              <th className="p-3 text-blue-900">Email</th>
              <th className="p-3 text-blue-900">Role</th>
              <th className="p-3 text-blue-900">Saldo</th>
              <th className="p-3 text-blue-900">Último acesso</th>
              <th className="p-3 text-blue-900">Ações</th>
            </tr>
          </thead>

          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-500">
                  Nenhum usuário encontrado
                </td>
              </tr>
            )}

            {users.map((user) => (
              <tr key={user.id} className="border-t transition hover:bg-blue-50">
                <td className="p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {user.displayName || 'Sem identificação'}
                  </p>
                  <p className="text-xs text-slate-500">{user.username || user.id}</p>
                </td>

                <td className="p-3 font-bold text-blue-800">{user.email || 'Sem e-mail'}</td>
                <td className="p-3 text-blue-600">{user.role || 'user'}</td>
                <td className="p-3 font-mono text-blue-600">{formatCurrency(user.balance)}</td>
                <td className="p-3 text-sm text-slate-600">
                  {formatDateTime(user.lastSignInAt || user.createdAt)}
                </td>

                <td className="p-3">
                  <button
                    onClick={async () => {
                      try {
                        setResettingUserId(user.id);

                        const {
                          data: { session },
                        } = await supabase.auth.getSession();

                        if (!session?.access_token) {
                          throw new Error('Sessão administrativa não encontrada.');
                        }

                        await resetPassword(user.id, user.email, session.access_token);
                        alert('Senha alterada com sucesso!');
                      } catch (resetError) {
                        const message =
                          resetError instanceof Error ? resetError.message : 'Erro ao alterar senha.';
                        alert(message);
                      } finally {
                        setResettingUserId(null);
                      }
                    }}
                    disabled={resettingUserId === user.id}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {resettingUserId === user.id ? 'Salvando...' : 'Editar senha'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
