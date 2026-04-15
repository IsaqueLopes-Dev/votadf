'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, type User } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        const { data } = await supabase.auth.getSession();
        const session = data.session;

        console.log('SESSION:', session);
        console.log('TOKEN:', session?.access_token);

        if (!session?.access_token) {
          setIsAuthorized(false);
          setLoading(false);
          return;
        }

        const checkRes = await fetch('/api/admin/check', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const result = await checkRes.json();
        console.log('ADMIN CHECK RESULT:', result);

        if (!checkRes.ok) {
          setIsAuthorized(false);
          setLoading(false);
          return;
        }

        setIsAuthorized(true);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Erro inesperado');
        setIsAuthorized(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // 🔥 LOADING
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50 flex items-center justify-center">
        <div className="text-slate-600">Carregando...</div>
      </div>
    );
  }

  // 🔥 NEGADO
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50 flex flex-col items-center justify-center p-4">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-10 max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-900 mb-4">Acesso Negado</h1>

          <p className="text-red-700 mb-6">
            Você não tem permissão para acessar o painel de administrador.
            {user?.email && (
              <>
                <br />
                Email: {user.email}
              </>
            )}
          </p>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          <button
            onClick={handleLogout}
            className="rounded-full bg-red-600 px-6 py-2 text-white w-full"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  // 🔥 DASHBOARD LIBERADO
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-50">

      {/* HEADER */}
      <header className="bg-blue-600 shadow-md">
        <div className="flex justify-between items-center px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Painel Admin - VotaDF</h1>
            {user?.email && (
              <p className="text-blue-100 text-sm">Admin: {user.email}</p>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-white"
          >
            Sair
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="p-6">

        <section className="mb-8 rounded-3xl border bg-white p-6 shadow-sm">
          <p className="text-sm text-blue-700">
            Gerencie votações, usuários e transações.
          </p>
        </section>

        {/* CARDS (mantidos do seu projeto) */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">

          <Link href="/admin/votacoes" className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="font-bold">Votações</h2>
          </Link>

          <Link href="/admin/usuarios" className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="font-bold">Usuários</h2>
          </Link>

          <Link href="/admin/transacoes" className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="font-bold">Transações</h2>
          </Link>

          <Link href="/admin/apostas" className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="font-bold">Apostas</h2>
          </Link>

          <Link href="/admin/saques" className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="font-bold">Saques</h2>
          </Link>

        </div>

      </main>
    </div>
  );
}
