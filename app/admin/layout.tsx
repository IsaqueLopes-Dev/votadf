import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Painel Admin - VotaDF',
  description: 'Painel de administração da plataforma VotaDF',
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
