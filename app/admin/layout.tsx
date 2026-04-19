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
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#111111] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(32deg,rgba(8,8,8,0.74)_30px,transparent_0)] bg-[length:60px_60px] bg-[-5px_-5px]" />
      <div className="pointer-events-none absolute inset-x-0 top-[-12rem] h-[28rem] bg-[radial-gradient(circle_at_top,rgba(0,195,255,0.18),transparent_58%)]" />
      <div className="pointer-events-none absolute bottom-[-14rem] right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(0,153,204,0.14),transparent_62%)] blur-3xl" />
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}
