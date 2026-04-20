import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import PublicVotingBoard from './public-voting-board';
import BottomNavigation from '../../components/bottom-navigation';
import AuthenticatedHomeRedirect from './authenticated-home-redirect';

const CATEGORY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'esportes', label: 'Esportes' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'celebridades', label: 'Celebridades' },
  { value: 'criptomoedas', label: 'Criptomoedas' },
] as const;

type CategoryValue = (typeof CATEGORY_OPTIONS)[number]['value'];

type Votacao = {
  id: string;
  titulo: string;
  descricao: string;
  opcoes: string[];
  ativa: boolean;
  created_at: string;
};

type SearchParams = Promise<{
  category?: string | string[] | undefined;
}>;

async function getVotacoesAtivas() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      return [];
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('votacoes')
      .select('id, titulo, descricao, opcoes, ativa, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
}

export default async function PublicMarketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const votacoes: Votacao[] = await getVotacoesAtivas();
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
        backgroundImage: 'linear-gradient(32deg, rgba(8,8,8,0.74) 30px, transparent)',
        backgroundSize: '60px 60px',
        backgroundPosition: '-5px -5px',
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      }}
    >
      <AuthenticatedHomeRedirect />
      <header
        className="sticky top-0 z-30 border-b border-blue-500/40 bg-blue-600/95 shadow-md backdrop-blur"
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
              <span className="text-xl sm:text-2xl font-bold text-white shrink-0 tracking-tight" style={{ fontFamily: 'inherit', marginBottom: -8, letterSpacing: 0 }}>
                Votaai
              </span>
              <span className="text-xs sm:text-sm font-medium text-cyan-200" style={{ marginTop: 0, fontFamily: 'inherit', textAlign: 'center' }}>
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
              className="flex-1 rounded-full border border-white/40 bg-white/15 px-3 py-2 text-center text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20 sm:flex-none sm:px-4 sm:py-2 sm:text-sm"
            >
              Criar conta ou fazer login
            </Link>
          </div>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col items-center px-3 py-8 pb-28 sm:px-2 sm:py-10 lg:pb-56">
        <h1 className="mb-2 text-center text-2xl font-bold text-white sm:text-3xl">Mercado de previsão</h1>
        <p className="mb-6 max-w-2xl text-center text-sm leading-6 text-cyan-200 sm:text-base">
          Acompanhe as votações e aposte no candidato que você acredita.
          <br />
          Odds definidas e atualizadas em tempo real.
        </p>
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

