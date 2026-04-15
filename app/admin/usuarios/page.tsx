'use client';

import { useEffect, useState } from 'react';
// Função para editar senha do usuário
function handleEditPassword(userId: string, userEmail: string) {
  const novaSenha = prompt(`Digite a nova senha para o usuário ${userEmail}:`);
  if (!novaSenha) return;
  fetch(`/api/admin/users/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, novaSenha }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        alert('Senha alterada com sucesso!');
      } else {
        alert('Erro ao alterar senha: ' + (data.error || 'Erro desconhecido'));
      }
    })
    .catch(() => alert('Erro ao alterar senha.'));
}
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type UserRow = {
  id: string;
  email: string;
  role: string;
  saldo: number;
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*');

        console.log('USERS:', data);
        console.log('ERROR:', error);

        if (error) {
          setError(error.message);
          return;
        }

        setUsers(data || []);
      } catch (err) {
        setError('Erro inesperado');
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-gray-600">
        Carregando usuários...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-600">
        Erro: {error}
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Usuários
      </h1>

      <div className="overflow-auto rounded-lg border bg-white">
        <table className="w-full text-left">
          <thead className="bg-blue-100">
            <tr>
              <th className="p-3 text-blue-900">ID</th>
              <th className="p-3 text-blue-900">Email</th>
              <th className="p-3 text-blue-900">Role</th>
              <th className="p-3 text-blue-900">Saldo</th>
              <th className="p-3 text-blue-900">Ações</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-blue-50 transition">
                <td className="p-3 text-sm text-blue-700 font-semibold">{u.id}</td>
                <td className="p-3 text-blue-800 font-bold">{u.email}</td>
                <td className="p-3 text-blue-600">{u.role}</td>
                <td className="p-3 text-blue-600">
                  {typeof u.saldo === 'number' && !isNaN(u.saldo) ? `R$ ${u.saldo}` : '---'}
                </td>
                <td className="p-3">
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-semibold shadow"
                    onClick={() => handleEditPassword(u.id, u.email)}
                  >
                    Editar Senha
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
