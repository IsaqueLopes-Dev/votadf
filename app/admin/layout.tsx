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
  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb' }}>
      {children}
    </div>
  );
}
