'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase'; // Utilize seu helper para evitar duplicidade/erros de build

// --- TIPOS ---
type UserRow = {
  id: string;
  email: string;
  role: string;
  saldo: number;
};

// --- FUNÇÃO EDITAR SENHA ---
async function handleEditPassword(userId: string, userEmail: string) {
  const novaSenha = prompt(`Digite a nova senha para o usuário ${userEmail}:`);
  if (!novaSenha) return;

  try {
    const res = await fetch('/api/admin/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, novaSenha }),
    });

    const data = await res.json();

    if (data.success) {
      alert('Senha alterada com sucesso!');
    } else {
      alert('Erro: ' + (data.error || 'Erro desconhecido'));
    }
  } catch {
    alert('Erro ao alterar senha.');
  }
}

// --- COMPONENTE ---
export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🔥 CARREGAR USUÁRIOS
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const supabase = createClient(); // Para o helper centralizado
        const { data, error } = await supabase
          .from('users')
          .select('*');

        if (error) {
          setError(error.message);
          return;
        }

        setUsers(data || []);
      } catch {
        setError('Erro inesperado ao carregar usuários');
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

  // 🔄 LOADING
  if (loading) {
    return (
      <div className="p-6 text-gray-600">
        Carregando usuários...
      </div>
    );
  }

  // ❌ ERRO
  if (error) {
    return (
      <div className="p-6 text-red-600 font-semibold">
        Erro: {error}
      </div>
    );
  }

  // ✅ TELA
  return (
    <div className="p-6 bg-slate-50 min-h-screen">

      <h1 className="text-2xl font-bold mb-6 text-slate-800">
        Painel de Usuários
      </h1>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">

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
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-500">
                  Nenhum usuário encontrado
                </td>
              </tr>
            )}

            {users.map((u) => (
              <tr
                key={u.id}
                className="border-t hover:bg-blue-50 transition"
              >
                <td className="p-3 text-sm text-blue-700 font-semibold">
                  {u.id}
                </td>

                <td className="p-3 text-blue-800 font-bold">
                  {u.email}
                </td>

                <td className="p-3 text-blue-600">
                  {u.role || 'user'}
                </td>

                <td className="p-3 text-blue-600 font-mono">
                  {typeof u.saldo === 'number'
                    ? `R$ ${u.saldo.toFixed(2)}`
                    : '---'}
                </td>

                <td className="p-3">
                  <button
                    onClick={() => handleEditPassword(u.id, u.email)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-semibold shadow"
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
