'use client';

import { useEffect, useState } from 'react';
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
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Saldo</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3 text-sm">{u.id}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.role}</td>
                <td className="p-3">R$ {u.saldo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
