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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full flex flex-col [font-family:var(--font-poppins),sans-serif]"
        style={{ background: '#e5e7eb' }}
      >
        {children}
      </body>
    </html>
  );
}
