

import Link from 'next/link';
import CategoryCarousel from './components/category-carousel';
import BottomNavigation from '../components/bottom-navigation';

const CATEGORY_OPTIONS = [
	{ value: 'todos', label: 'Todos' },
	{ value: 'politica', label: 'Política' },
	{ value: 'entretenimento', label: 'Entretenimento' },
	{ value: 'futebol', label: 'Futebol' },
];

type Votacao = {
	id: string | number;
	titulo: string;
	descricao: string;
	opcoes?: any;
	ativa?: boolean;
	created_at: string;
};



function parsePollMetadata(descricao: string | null | undefined) {
	const rawDescription = descricao || '';
	if (rawDescription.startsWith('__meta__:')) {
		const lineBreakIndex = rawDescription.indexOf('\n');
		const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);
		const cleanDescription = lineBreakIndex === -1 ? '' : rawDescription.slice(lineBreakIndex + 1);
		try {
			const parsed = JSON.parse(metaLine.replace('__meta__:', '')) as {
				categoria?: string;
				encerramentoAposta?: string;
				bettingClosesAt?: string;
			};
			return {
				categoria: parsed.categoria || '',
				encerramentoAposta: String(parsed.encerramentoAposta || parsed.bettingClosesAt || '').trim(),
				descricaoLimpa: cleanDescription,
			};
		} catch {
			return { categoria: '', encerramentoAposta: '', descricaoLimpa: cleanDescription };
		}
	}
	return { categoria: '', encerramentoAposta: '', descricaoLimpa: rawDescription };
}

function getCategoryLabel(categoria: string) {
	return CATEGORY_OPTIONS.find((option) => option.value === categoria)?.label || 'Sem categoria';
}

function formatDate(date: string) {
	try {
		return new Date(date).toLocaleString('pt-BR');
	} catch {
		return date;
	}
}


async function getVotacoesAtivas() {
	try {
		const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/votacoes/public`, { cache: 'no-store' });
		if (!res.ok) return [];
		const json = await res.json();
		return json.votacoes || [];
	} catch {
		return [];
	}
}


export default async function Home() {
  // Exibir todas as votações ativas sem filtro de categoria
  const votacoes: Votacao[] = await getVotacoesAtivas();
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
      {/* Header/Navbar */}
      <header className="sticky top-0 z-30 border-b border-blue-500/40 bg-blue-600/95 shadow-md backdrop-blur" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
        <div className="flex w-full items-center justify-between gap-2 py-3 sm:py-4 px-4 sm:px-10" style={{maxWidth: 1200, margin: '0 auto'}}>
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Logo VP"
              style={{ height: 36, width: 36, objectFit: 'contain', marginRight: 8 }}
            />
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1}}>
              <span className="text-xl sm:text-2xl font-bold text-white shrink-0 tracking-tight" style={{fontFamily: 'inherit', marginBottom: -8, letterSpacing: 0}}>Votaai</span>
              <span className="text-xs sm:text-sm font-medium text-cyan-200" style={{marginTop: 0, fontFamily: 'inherit', textAlign: 'center'}}>Previsão</span>
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
      {/* Conteúdo principal */}
      <main className="flex flex-col items-center flex-1 w-full py-10 px-2">
        <h1 className="text-3xl font-bold text-white mb-2">Mercado de previsão</h1>
        <p className="text-cyan-200 mb-6 text-center">Acompanhe as votações e aposte no candidato que você acredita.<br />Odds definidas e atualizadas em tempo real.</p>
        <div className="w-full max-w-2xl mb-8">
          <CategoryCarousel categories={CATEGORY_OPTIONS} selectedCategory={"todos"} />
        </div>
        <div className="w-full max-w-2xl">
          <h2 className="text-xl font-bold text-white mb-4">Votações em destaque</h2>
          {votacoes.length === 0 ? (
            <div className="text-cyan-200 text-center py-8 rounded-xl bg-cyan-900/30 border border-cyan-700">
              <p>Nenhuma votação ativa no momento. Volte em breve!</p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {votacoes.map((votacao) => (
                <div key={votacao.id} className="card">
                  <div className="card__content">
                    <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>{votacao.titulo}</h3>
                    <p style={{ fontSize: 14, marginBottom: 12, textAlign: 'center', color: '#b3b3ff' }}>{votacao.descricao}</p>
                    <p style={{ fontSize: 12, color: '#7de2ff', marginTop: 'auto', textAlign: 'center' }}>
                      Criada em: {formatDate(votacao.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}
<<<<<<< HEAD

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
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900"
      style={{ fontFamily: 'var(--font-poppins), sans-serif' }}
    >
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-blue-400/20 blur-3xl" />

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
        <div className="rounded-3xl border border-cyan-400 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 p-6 shadow-2xl sm:p-10">
          <section className="mb-10 grid gap-6 rounded-3xl border border-cyan-400 bg-gradient-to-br from-blue-800 via-blue-900 to-cyan-900 p-6 text-cyan-100 shadow-lg sm:grid-cols-[1.2fr_0.8fr] sm:p-8">
            <div>
              <p className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-100">
                Mercado de previsão
              </p>
              <h2 className="text-3xl font-bold leading-tight text-cyan-100 sm:text-4xl">Acompanhe as votações e aposte no candidato que você acredita.</h2>
              <p className="mt-4 text-sm leading-7 text-cyan-200 sm:text-base">Odds definidas e atualizadas em tempo real.</p>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="rounded-2xl border border-cyan-400 bg-cyan-900/30 px-4 py-3">
                <p className="text-cyan-200">Votações ativas</p>
                <p className="mt-1 text-2xl font-bold text-cyan-100">{filteredVotacoes.length}</p>
              </div>
              <div className="rounded-2xl border border-cyan-400 bg-cyan-900/30 px-4 py-3">
                <p className="text-cyan-200">Categorias</p>
                <p className="mt-1 text-2xl font-bold text-cyan-100">3</p>
              </div>
            </div>
          </section>

          <div className="mb-10">
            <h2 className="text-2xl font-bold text-cyan-100 sm:text-3xl">Votações em destaque</h2>
            <p className="mt-3 text-base leading-8 text-cyan-200 sm:text-lg">
              Clique no candidato para entrar no fluxo de aposta.
            </p>
          </div>

          {/* Votações Ativas */}
          <section className="mb-12 rounded-3xl border border-cyan-400 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 p-5 shadow-lg sm:p-6">
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-cyan-100">Votações Ativas</h2>
                <p className="hidden text-xs font-medium uppercase tracking-[0.18em] text-cyan-400 sm:block">
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
                    className="rounded-3xl border border-cyan-400 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 p-6 shadow-lg ring-1 ring-cyan-700/40 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-xl"
                  >
                    {(() => {
                      const metadata = parsePollMetadata(votacao.descricao);
                      const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
                      const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();

                      return (
                        <>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-cyan-100 sm:text-lg">{votacao.titulo}</h3>
                            <span className="rounded-full bg-amber-700/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 border border-amber-400">
                              {getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                              metadata.tipo === 'enquete-candidatos'
                                ? 'bg-blue-800/30 text-blue-200 border-blue-400'
                                : 'bg-slate-800/30 text-slate-200 border-slate-500'
                            }`}>
                              {metadata.tipo === 'enquete-candidatos' ? 'Enquete por candidato' : 'Opções livres'}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                              isBetClosed ? 'bg-rose-900/30 text-rose-200 border-rose-400' : 'bg-emerald-900/30 text-emerald-200 border-emerald-400'
                            }`}>
                              {isBetClosed ? 'Aposta encerrada' : 'Aposta aberta'}
                            </span>
                          </div>
                          <p className="mb-4 line-clamp-3 text-sm leading-6 text-cyan-200">{metadata.descricaoLimpa}</p>
                          <p className="mb-4 text-xs text-cyan-400">
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
                                    <CandidatoLink
                                      key={idx}
                                      votacaoId={votacao.id}
                                      className="block rounded-2xl border border-cyan-400 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 px-3 py-2.5 transition hover:border-cyan-300 hover:bg-cyan-900/30"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-cyan-400 bg-cyan-900">
                                            {parsedOption.imageUrl ? (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-full w-full object-cover" />
                                            ) : (
                                              <span className="text-xs font-semibold text-cyan-300">{parsedOption.label.slice(0, 1).toUpperCase()}</span>
                                            )}
                                          </div>
                                          <span className="text-sm font-semibold text-cyan-100">{parsedOption.label}</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <span className="rounded-full bg-emerald-700/20 px-3 py-1 text-xs font-bold text-emerald-200 border border-emerald-400">
                                            {parsedOption.odds || '-'}
                                          </span>
                                          <span className="rounded-full bg-cyan-700/20 px-3 py-1 text-xs font-bold text-cyan-200 border border-cyan-400">
                                            {percent}%
                                          </span>
                                        </div>
                                      </div>
                                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cyan-900">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-400"
                                          style={{ width: `${percent}%` }}
                                        />
                                      </div>
                                      <p className="mt-1 text-[11px] font-medium text-cyan-300">{votes[idx]} apostas</p>
                                    </CandidatoLink>
                                  );
                                });
                              })()}
                            </div>
                          ) : (
                            <div className="mb-4 flex flex-wrap gap-2">
                              {Array.isArray(votacao.opcoes) && votacao.opcoes.map((opcao: string, idx: number) => {
                                const parsedOption = parsePollOption(opcao);

                                return (
                                  <span key={idx} className="inline-flex items-center gap-2 rounded-full bg-cyan-900/30 border border-cyan-400 px-3 py-1 text-xs text-cyan-200">
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
                          <p className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-cyan-400">Toque em um candidato para participar</p>
                        </>
                      );
                    })()}
                    <ParticiparButton votacaoId={votacao.id} />
                    <p className="mt-2 text-xs text-cyan-400">Login necessário para participar.</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-cyan-900 bg-gradient-to-br from-slate-900 to-blue-900 p-8 text-center">
                <p className="text-cyan-200">
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
=======
>>>>>>> 44a598c (ajustes landing, cards, admin, bugs)
