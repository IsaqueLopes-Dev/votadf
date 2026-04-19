import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Painel Admin - Votaai Previsão',
  description: 'Painel de administração da plataforma Votaai Previsão',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-slate-100 text-slate-950">{children}</div>;
}
