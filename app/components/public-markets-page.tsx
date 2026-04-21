import Link from 'next/link';
import PublicVotingBoard from './public-voting-board';
import BottomNavigation from '../../components/bottom-navigation';
import AuthenticatedHomeRedirect from './authenticated-home-redirect';
import { CATEGORY_OPTIONS, type CategoryValue } from '../utils/voting-market';
import { getPublicVotacoes } from '../utils/voting-market-server';

type SearchParams = Promise<{
  category?: string | string[] | undefined;
}>;

export default async function PublicMarketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const votacoes = await getPublicVotacoes();
  const resolvedSearchParams = await searchParams;
  const categoryParam = Array.isArray(resolvedSearchParams.category)
    ? resolvedSearchParams.category[0]
    : resolvedSearchParams.category;
  const normalizedCategoryParam = categoryParam === 'futebol' ? 'esportes' : categoryParam;
  const selectedCategory = CATEGORY_OPTIONS.some((option) => option.value === normalizedCategoryParam)
    ? (normalizedCategoryParam as CategoryValue)
    : 'todos';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: '#111111',
        backgroundImage:
          'radial-gradient(circle at top, rgba(6,182,212,0.12), transparent 28%), linear-gradient(32deg, rgba(8,8,8,0.74) 30px, transparent)',
        backgroundSize: '100% 100%, 60px 60px',
        backgroundPosition: 'center top, -5px -5px',
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      }}
    >
      <AuthenticatedHomeRedirect />
      <header
        className="sticky top-0 z-30 border-b border-blue-500/30 bg-[#071120]/90 shadow-md backdrop-blur"
        style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
      >
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-10 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Logo VP"
              style={{ height: 36, width: 36, objectFit: 'contain', marginRight: 8 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
              <span
                className="text-xl sm:text-2xl font-bold text-white shrink-0 tracking-tight"
                style={{ fontFamily: 'inherit', marginBottom: -8, letterSpacing: 0 }}
              >
                Votaai
              </span>
              <span
                className="text-xs sm:text-sm font-medium text-cyan-200"
                style={{ marginTop: 0, fontFamily: 'inherit', textAlign: 'center' }}
              >
                Previsão
              </span>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
            <Link
              href="/login?next=%2Fhome%3Fdeposit%3D1"
              className="flex-1 rounded-full bg-white px-3 py-2 text-center text-xs font-bold text-blue-600 shadow-[0_6px_16px_-8px_rgba(30,64,175,0.65)] transition hover:-translate-y-0.5 hover:bg-blue-50 sm:flex-none sm:px-4 sm:py-2 sm:text-sm"
            >
              Depositar
            </Link>
            <Link
              href="/login"
              className="flex-1 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-center text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20 sm:flex-none sm:px-4 sm:py-2 sm:text-sm"
            >
              Criar conta ou fazer login
            </Link>
          </div>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col items-center px-3 py-8 pb-28 sm:px-2 sm:py-10 lg:pb-56">
        <div className="mb-6 max-w-5xl text-center">
          <h1 className="text-center text-3xl font-bold text-white sm:text-4xl">Acompanhe os mercados em destaque</h1>
          <p className="mt-3 text-sm leading-6 text-cyan-100/85 sm:text-base">
            Veja rapidamente as principais votações abertas e entre em cada mercado para acompanhar todos os detalhes.
          </p>
        </div>

        <div className="w-full">
          <PublicVotingBoard
            categories={[...CATEGORY_OPTIONS]}
            initialSelectedCategory={selectedCategory}
            votacoes={votacoes}
          />
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}
