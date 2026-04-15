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
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 flex items-center justify-center">
        <div className="text-white/80 text-lg">Carregando...</div>
      </div>
    );
  }

  // 🔥 NEGADO
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500 flex flex-col items-center justify-center p-4">
        <div className="rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 p-10 max-w-md text-center shadow-xl">
          <h1 className="text-2xl font-bold text-red-300 mb-4">
            Acesso Negado
          </h1>

          <p className="text-white/80 mb-6">
            Você não tem permissão para acessar o painel de administrador.
            {user?.email && (
              <>
                <br />
                <span className="text-white/60">Email: {user.email}</span>
              </>
            )}
          </p>

          {error && (
            <p className="text-red-300 text-sm mb-4">{error}</p>
          )}

          <button
            onClick={handleLogout}
            className="rounded-full bg-red-500 hover:bg-red-600 transition px-6 py-2 text-white w-full"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  // 🔥 DASHBOARD LIBERADO
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500">

      {/* HEADER */}
      <header className="bg-blue-950/40 backdrop-blur-md border-b border-white/10 shadow-lg">
        <div className="flex justify-between items-center px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Painel Admin - VotaDF
            </h1>

            {user?.email && (
              <p className="text-blue-100 text-sm">
                Admin: {user.email}
              </p>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="rounded-full bg-white/10 hover:bg-white/20 transition px-5 py-2 text-white border border-white/20"
          >
            Sair
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="p-8">

        {/* INFO */}
        <section className="mb-8 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-6 shadow-lg">
          <p className="text-white/80 text-sm">
            Gerencie votações, usuários e transações.
          </p>
        </section>

        {/* CARDS */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">

          <Link href="/admin/votacoes">
            <div className="rounded-2xl bg-white p-6 shadow-lg hover:scale-[1.03] transition">
              <h2 className="font-bold text-blue-900">Votações</h2>
            </div>
          </Link>

          <Link href="/admin/usuarios">
            <div className="rounded-2xl bg-white p-6 shadow-lg hover:scale-[1.03] transition">
              <h2 className="font-bold text-blue-900">Usuários</h2>
            </div>
          </Link>

          <Link href="/admin/transacoes">
            <div className="rounded-2xl bg-white p-6 shadow-lg hover:scale-[1.03] transition">
              <h2 className="font-bold text-blue-900">Transações</h2>
            </div>
          </Link>

          <Link href="/admin/apostas">
            <div className="rounded-2xl bg-white p-6 shadow-lg hover:scale-[1.03] transition">
              <h2 className="font-bold text-blue-900">Apostas</h2>
            </div>
          </Link>

          <Link href="/admin/saques">
            <div className="rounded-2xl bg-white p-6 shadow-lg hover:scale-[1.03] transition">
              <h2 className="font-bold text-blue-900">Saques</h2>
            </div>
          </Link>

        </div>

      </main>
    </div>
  );
}
