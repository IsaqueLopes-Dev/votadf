import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Painel Admin - Votaai Previsão',
  description: 'Painel de administração da plataforma Votaai Previsão',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#18181b] text-white min-h-screen flex">
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-4">
        <h2 className="text-xl font-bold mb-6">Votaai Previsão</h2>

        <nav className="flex flex-col gap-2">
          <Link href="/admin/usuarios" className="p-2 rounded hover:bg-zinc-800 transition">
            Usuários
          </Link>

          <Link href="/" className="p-2 rounded hover:bg-zinc-800 transition">
            Voltar ao site
          </Link>
        </nav>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
