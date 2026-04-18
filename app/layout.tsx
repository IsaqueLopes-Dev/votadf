import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VotaAí Previsão',
  description: 'Plataforma de mercado de previsão da VotaAí.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col [font-family:var(--font-poppins),sans-serif]"
        style={{ background: '#e5e7eb' }}
      >
        {children}
      </body>
    </html>
  );
}
