import BottomNavigation from '../../components/bottom-navigation';
import SiteHeader from '../components/site-header';

export default function MercadosLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          'radial-gradient(circle at top, rgba(8,145,178,0.18), transparent 32%), linear-gradient(180deg, #06080d 0%, #0a0d13 44%, #080b10 100%)',
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      }}
    >
      <SiteHeader />
      {children}
      <BottomNavigation />
    </div>
  );
}
