import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import CategoryCarousel from './components/category-carousel';
import ParticiparButton from './components/participar-button';

const META_PREFIX = '__meta__:';
const CATEGORY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'politica', label: 'Política' },
  { value: 'entretenimento', label: 'Entretenimento' },
  { value: 'futebol', label: 'Futebol' },
] as const;

type PollType = 'opcoes-livres' | 'enquete-candidatos';
type PollCategory = 'politica' | 'entretenimento' | 'futebol' | '';

type PollOption = {
  label: string;
  imageUrl: string;
  odds: string;
  oddsNao: string;
};

type BetCountsMap = Record<string, Record<string, number>>;

const parsePollMetadata = (descricao: string | null | undefined) => {
  const rawDescription = descricao || '';

  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
    const cleanDescription = lineBreakIndex === -1 ? '' : rawDescription.slice(lineBreakIndex + 1);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, '')) as {
        tipo?: PollType;
        categoria?: PollCategory;
        encerramentoAposta?: string;
        bettingClosesAt?: string;
      };
      return {
        tipo: parsed.tipo === 'enquete-candidatos' ? 'enquete-candidatos' : 'opcoes-livres',
        categoria:
          parsed.categoria === 'politica' || parsed.categoria === 'entretenimento' || parsed.categoria === 'futebol'
            ? parsed.categoria
            : '',
        encerramentoAposta: String(parsed.encerramentoAposta || parsed.bettingClosesAt || '').trim(),
        descricaoLimpa: cleanDescription,
      };
    } catch {
      return {
        tipo: 'opcoes-livres' as const,
        categoria: '' as PollCategory,
        encerramentoAposta: '',
        descricaoLimpa: cleanDescription,
      };
    }
  }

  if (rawDescription.startsWith('__tipo__:enquete-candidatos\n')) {
    return {
      tipo: 'enquete-candidatos' as const,
      categoria: '' as PollCategory,
      encerramentoAposta: '',
      descricaoLimpa: rawDescription.replace('__tipo__:enquete-candidatos\n', ''),
    };
  }

  return {
    tipo: 'opcoes-livres' as const,
    categoria: '' as PollCategory,
    encerramentoAposta: '',
    descricaoLimpa: rawDescription,
  };
};

const getCategoryLabel = (categoria: string) => {
  return CATEGORY_OPTIONS.find((option) => option.value === categoria)?.label || 'Sem categoria';
};

const parsePollOption = (option: unknown): PollOption => {
  if (typeof option !== 'string') {
    return { label: '', imageUrl: '', odds: '', oddsNao: '' };
  }

  try {
    const parsed = JSON.parse(option) as Partial<
      PollOption & { odds: number | null; oddsNao: number | null; image_url: string; image: string; avatarUrl: string }
    >;
    if (typeof parsed.label === 'string') {
      return {
        label: parsed.label,
        imageUrl:
          typeof parsed.imageUrl === 'string'
            ? parsed.imageUrl
            : typeof parsed.image_url === 'string'
              ? parsed.image_url
              : typeof parsed.image === 'string'
                ? parsed.image
                : typeof parsed.avatarUrl === 'string'
                  ? parsed.avatarUrl
                  : '',
        odds: parsed.odds != null && Number.isFinite(Number(parsed.odds)) ? String(parsed.odds) : '',
        oddsNao: parsed.oddsNao != null && Number.isFinite(Number(parsed.oddsNao)) ? String(parsed.oddsNao) : '',
      };
    }
  } catch {
    // Compatibilidade com opções antigas em texto puro.
  }

  return {
    label: option,
    imageUrl: '',
    odds: '',
    oddsNao: '',
  };
};

const getDeterministicHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const normalizeCandidate = (value: string) => value.trim().toLowerCase();

const getSimulatedBaseBets = (votacaoId: string, option: PollOption, index: number) => {
  const hash = getDeterministicHash(`${votacaoId}:${option.label}:${index}:base`);
  return 18 + (hash % 73);
};

const getRealBetCount = (counts: BetCountsMap, votacaoId: string, candidateLabel: string) => {
  return counts[votacaoId]?.[normalizeCandidate(candidateLabel)] || 0;
};

const getSimulatedScore = (votacaoId: string, option: PollOption, index: number) => {
  const odd = Number(option.odds || 0);
  const oddWeight = Number.isFinite(odd) && odd > 0 ? 1 / odd : 0.5;
  const hash = getDeterministicHash(`${votacaoId}:${option.label}:${index}`);
  const jitter = 0.82 + (hash % 36) / 100;
  return oddWeight * jitter;
};

export const revalidate = 10;

async function getVotacoesAtivas() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      console.error('Configuração do Supabase ausente para carregar votações públicas.');
      return [];
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('votacoes')
      .select('id, titulo, descricao, opcoes, ativa, created_at')
      .eq('ativa', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar votações:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Erro:', error);
    return [];
  }
}

async function getBetCounts(): Promise<BetCountsMap> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !serviceRole) {
      return {};
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRole);
    const counts: BetCountsMap = {};
    let page = 1;
    const perPage = 100;

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) {
        return {};
      }

      const users = data.users || [];

      users.forEach((user) => {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const rawBets = Array.isArray(metadata.bets) ? metadata.bets : [];

        rawBets.forEach((item) => {
          const bet = (item || {}) as Record<string, unknown>;
          const votacaoId = String(bet.votacaoId || '').trim();
          const candidato = normalizeCandidate(String(bet.candidato || ''));

          if (!votacaoId || !candidato) return;
          if (!counts[votacaoId]) counts[votacaoId] = {};
          counts[votacaoId][candidato] = (counts[votacaoId][candidato] || 0) + 1;
        });
      });

      if (users.length < perPage) {
        break;
      }

      page += 1;
    }

    return counts;
  } catch {
    return {};
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string }>;
}) {
  const [votacoes, betCounts] = await Promise.all([getVotacoesAtivas(), getBetCounts()]);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedCategory =
    resolvedSearchParams?.category === 'politica' ||
    resolvedSearchParams?.category === 'entretenimento' ||
    resolvedSearchParams?.category === 'futebol'
      ? resolvedSearchParams.category
      : 'todos';

  const filteredVotacoes = votacoes.filter((votacao: any) => {
    if (selectedCategory === 'todos') {
      return true;
    }

    const metadata = parsePollMetadata(votacao.descricao);
    return metadata.categoria === selectedCategory;
  });

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#dbeafe_0%,_#f8fafc_42%,_#f8fafc_100%)]"
      style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
    >
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-300/25 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-cyan-200/25 blur-3xl" />

      <header className="sticky top-0 z-30 border-b border-blue-500/40 bg-blue-600/95 shadow-md backdrop-blur">
        <div className="flex w-full items-center justify-between gap-3 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/20 ring-1 ring-white/30" />
            <h1 className="shrink-0 text-xl font-bold tracking-tight text-white sm:text-2xl">VotaDF</h1>
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

      <div className="w-full py-6 sm:py-10">
        <div className="rounded-3xl border border-blue-100 bg-white/95 p-6 shadow-[0_20px_50px_-24px_rgba(30,64,175,0.35)] backdrop-blur sm:p-10">
          <section className="mb-10 grid gap-6 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-600 to-blue-500 p-6 text-white shadow-lg sm:grid-cols-[1.2fr_0.8fr] sm:p-8">
            <div>
              <p className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-100">
                Mercado de previsão
              </p>
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl">Acompanhe as votações e aposte no candidato que você acredita.</h2>
              <p className="mt-4 text-sm leading-7 text-blue-100 sm:text-base">Odds definidas e atualizadas em tempo real.</p>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                <p className="text-blue-100">Votações ativas</p>
                <p className="mt-1 text-2xl font-bold text-white">{filteredVotacoes.length}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                <p className="text-blue-100">Categorias</p>
                <p className="mt-1 text-2xl font-bold text-white">3</p>
              </div>
            </div>
          </section>

          <div className="mb-10">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Votações em destaque</h2>
            <p className="mt-3 text-base leading-8 text-slate-600 sm:text-lg">
              Clique no candidato para entrar no fluxo de aposta.
            </p>
          </div>

          {/* Votações Ativas */}
          <section className="mb-12 rounded-3xl border border-blue-100/80 bg-gradient-to-b from-white to-blue-50/40 p-5 shadow-sm sm:p-6">
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-slate-900">Votações Ativas</h2>
                <p className="hidden text-xs font-medium uppercase tracking-[0.18em] text-slate-400 sm:block">
                  Categorias
                </p>
              </div>

              <CategoryCarousel categories={[...CATEGORY_OPTIONS]} selectedCategory={selectedCategory} />
            </div>
            {filteredVotacoes.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2">
                {filteredVotacoes.map((votacao: any) => (
                  <div
                    key={votacao.id}
                    className="rounded-3xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 p-6 shadow-sm ring-1 ring-white/60 transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                  >
                    {(() => {
                      const metadata = parsePollMetadata(votacao.descricao);
                      const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
                      const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();

                      return (
                        <>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{votacao.titulo}</h3>
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                              {getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              metadata.tipo === 'enquete-candidatos'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-200 text-slate-700'
                            }`}>
                              {metadata.tipo === 'enquete-candidatos' ? 'Enquete por candidato' : 'Opções livres'}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              isBetClosed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {isBetClosed ? 'Aposta encerrada' : 'Aposta aberta'}
                            </span>
                          </div>
                          <p className="mb-4 line-clamp-3 text-sm leading-6 text-slate-600">{metadata.descricaoLimpa}</p>
                          <p className="mb-4 text-xs text-slate-500">
                            Encerra em:{' '}
                            {metadata.encerramentoAposta
                              ? new Date(metadata.encerramentoAposta).toLocaleString('pt-BR')
                              : 'Não definido'}
                          </p>
                          {metadata.tipo === 'enquete-candidatos' ? (
                            <div className="mb-4 space-y-2.5">
                              {Array.isArray(votacao.opcoes) && (() => {
                                const parsedOptions = votacao.opcoes.map((candidato: string) => parsePollOption(candidato));
                                const votes = parsedOptions.map((option: PollOption, idx: number) => {
                                  const baseVotes = getSimulatedBaseBets(votacao.id, option, idx);
                                  const realVotes = getRealBetCount(betCounts, votacao.id, option.label);
                                  return baseVotes + realVotes;
                                });
                                const totalVotes = votes.reduce((acc: number, current: number) => acc + current, 0);

                                return parsedOptions.map((parsedOption: PollOption, idx: number) => {
                                  const percent = totalVotes > 0 ? Math.max(1, Math.round((votes[idx] / totalVotes) * 100)) : 0;

                                  return (
                                    <Link
                                      key={idx}
                                      href={`/home?participar=${encodeURIComponent(votacao.id)}`}
                                      className="block rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-blue-300 hover:bg-blue-50/30"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                                            {parsedOption.imageUrl ? (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-full w-full object-cover" />
                                            ) : (
                                              <span className="text-xs font-semibold text-slate-400">{parsedOption.label.slice(0, 1).toUpperCase()}</span>
                                            )}
                                          </div>
                                          <span className="text-sm font-semibold text-slate-800">{parsedOption.label}</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                                            {parsedOption.odds || '-'}
                                          </span>
                                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200">
                                            {percent}%
                                          </span>
                                        </div>
                                      </div>
                                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                                          style={{ width: `${percent}%` }}
                                        />
                                      </div>
                                      <p className="mt-1 text-[11px] font-medium text-slate-500">{votes[idx]} apostas</p>
                                    </Link>
                                  );
                                });
                              })()}
                            </div>
                          ) : (
                            <div className="mb-4 flex flex-wrap gap-2">
                              {Array.isArray(votacao.opcoes) && votacao.opcoes.map((opcao: string, idx: number) => {
                                const parsedOption = parsePollOption(opcao);

                                return (
                                  <span key={idx} className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">
                                    {parsedOption.imageUrl && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-5 w-5 rounded-full object-cover" />
                                    )}
                                    {parsedOption.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          <p className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Toque em um candidato para participar</p>
                        </>
                      );
                    })()}
                    <ParticiparButton votacaoId={votacao.id} />
                    <p className="mt-2 text-xs text-slate-500">Login necessário para participar.</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-8 text-center">
                <p className="text-slate-600">
                  {selectedCategory === 'todos'
                    ? 'Nenhuma votação ativa no momento. Volte em breve!'
                    : `Nenhuma votação ativa na categoria ${getCategoryLabel(selectedCategory)}.`}
                </p>
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  );
}