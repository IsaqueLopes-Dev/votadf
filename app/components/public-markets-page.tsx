import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import PublicVotingBoard from './public-voting-board';
import BottomNavigation from '../../components/bottom-navigation';

const META_PREFIX = '__meta__:';

const CATEGORY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'politica', label: 'Politica' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'futebol', label: 'Futebol' },
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

function parsePollMetadata(descricao: string | null | undefined) {
  const rawDescription = descricao || '';

  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
    const cleanDescription = lineBreakIndex === -1 ? '' : rawDescription.slice(lineBreakIndex + 1);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, '')) as {
        categoria?: CategoryValue;
      };

      return {
        categoria: parsed.categoria || 'todos',
        descricaoLimpa: cleanDescription || rawDescription,
      };
    } catch {
      return {
        categoria: 'todos' as CategoryValue,
        descricaoLimpa: cleanDescription || rawDescription,
      };
    }
  }

  return {
    categoria: 'todos' as CategoryValue,
    descricaoLimpa: rawDescription,
  };
}

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
      .eq('ativa', true)
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
  const selectedCategory = CATEGORY_OPTIONS.some((option) => option.value === categoryParam)
    ? (categoryParam as CategoryValue)
    : 'todos';

  const filteredVotacoes = votacoes.filter((votacao) => {
    if (selectedCategory === 'todos') return true;
    return parsePollMetadata(votacao.descricao).categoria === selectedCategory;
  });

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
      <header
        className="sticky top-0 z-30 border-b border-blue-500/40 bg-blue-600/95 shadow-md backdrop-blur"
        style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
      >
        <div className="flex w-full items-center justify-between gap-2 py-3 sm:py-4 px-4 sm:px-10" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="flex items-center gap-3">
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
                Previsao
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login?next=%2Fhome%3Fdeposit%3D1"
              className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-blue-600 shadow-[0_6px_16px_-8px_rgba(30,64,175,0.65)] transition hover:-translate-y-0.5 hover:bg-blue-50 sm:px-4 sm:py-2 sm:text-sm"
            >
              Depositar
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20 sm:px-4 sm:py-2 sm:text-sm"
            >
              Criar conta ou fazer login
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-col items-center flex-1 w-full py-10 px-2 pb-28">
        <h1 className="text-3xl font-bold text-white mb-2">Mercado de previsao</h1>
        <p className="text-cyan-200 mb-6 text-center">
          Acompanhe as votacoes e aposte no candidato que voce acredita.
          <br />
          Odds definidas e atualizadas em tempo real.
        </p>

        <div className="w-full max-w-2xl">
          <PublicVotingBoard
            categories={[...CATEGORY_OPTIONS]}
            initialSelectedCategory={selectedCategory}
            votacoes={filteredVotacoes}
          />
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}
