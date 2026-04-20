'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createClient, type User } from '@supabase/supabase-js';
import CategoryCarousel from './category-carousel';

const META_PREFIX = '__meta__:';

type CategoryValue = 'todos' | 'politica' | 'entretenimento' | 'esportes' | 'financeiro' | 'celebridades' | 'criptomoedas';
type PollType = 'opcoes-livres' | 'enquete-candidatos';
type PollCategory = 'politica' | 'entretenimento' | 'esportes' | 'financeiro' | 'celebridades' | 'criptomoedas' | '';

type CategoryOption = {
  value: CategoryValue;
  label: string;
};

type PollOption = {
  label: string;
  imageUrl: string;
  odds: string;
  oddsNao: string;
};

type PollOptionLike = Partial<
  PollOption & {
    image_url: string;
    image: string;
    avatarUrl: string;
    candidato: string;
    name: string;
  }
>;

type VotingRecord = {
  id: string;
  titulo: string;
  descricao: string;
  opcoes: string[];
  ativa: boolean;
  created_at: string;
};

type BetCountsMap = Record<string, Record<string, number>>;

type BetModalState = {
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  imageUrl: string;
};

type BetCommentItem = {
  id: string;
  votacao_id: string;
  user_id: string;
  username: string;
  message: string;
  avatar_url?: string;
  created_at: string;
};

type PublicVotingBoardProps = {
  initialSelectedCategory: CategoryValue;
  votacoes: VotingRecord[];
  categories: CategoryOption[];
};

const normalizePollCategory = (value: unknown): PollCategory => {
  if (value === 'futebol' || value === 'esportes') return 'esportes';
  if (value === 'politica' || value === 'entretenimento' || value === 'financeiro' || value === 'celebridades' || value === 'criptomoedas') {
    return value;
  }

  return '';
};

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
        categoria: normalizePollCategory(parsed.categoria),
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

  return {
    tipo: 'opcoes-livres' as const,
    categoria: '' as PollCategory,
    encerramentoAposta: '',
    descricaoLimpa: rawDescription,
  };
};

const readPollOptionRecord = (option: PollOptionLike): PollOption => ({
  label: String(option.label || option.candidato || option.name || '').trim(),
  imageUrl: String(option.imageUrl || option.image_url || option.image || option.avatarUrl || '').trim(),
  odds: option.odds != null && Number.isFinite(Number(option.odds)) ? String(option.odds) : '',
  oddsNao: option.oddsNao != null && Number.isFinite(Number(option.oddsNao)) ? String(option.oddsNao) : '',
});

const parsePollOption = (option: unknown): PollOption => {
  if (option && typeof option === 'object') {
    return readPollOptionRecord(option as PollOptionLike);
  }

  if (typeof option === 'string') {
    try {
      const parsed = JSON.parse(option) as PollOptionLike;
      return readPollOptionRecord(parsed);
    } catch {
      return {
        label: option,
        imageUrl: '',
        odds: '',
        oddsNao: '',
      };
    }
  }

  return { label: '', imageUrl: '', odds: '', oddsNao: '' };
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

const getDisplayedOdd = (value: string) => {
  if (value === '') return '-';
  return `${value}x`;
};

const getCardDescription = (value: string) =>
  value.replace(/^faça sua votação!\s*/i, '').replace(/^faca sua votacao!\s*/i, '').trim();

const DESCRIPTION_PREVIEW_LENGTH = 60;

export default function PublicVotingBoard({
  initialSelectedCategory,
  votacoes,
  categories,
}: PublicVotingBoardProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue>(initialSelectedCategory);
  const [betCounts, setBetCounts] = useState<BetCountsMap>({});
  const [betModal, setBetModal] = useState<BetModalState | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [placingBet, setPlacingBet] = useState(false);
  const [betFeedback, setBetFeedback] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [expandedCommentsId, setExpandedCommentsId] = useState<string | null>(null);
  const [commentsByVotingId, setCommentsByVotingId] = useState<Record<string, BetCommentItem[]>>({});
  const [commentDraftByVotingId, setCommentDraftByVotingId] = useState<Record<string, string>>({});
  const [commentStatusByVotingId, setCommentStatusByVotingId] = useState<Record<string, string | null>>({});
  const [loadingCommentsByVotingId, setLoadingCommentsByVotingId] = useState<Record<string, boolean>>({});
  const [expandedDescriptionByVotingId, setExpandedDescriptionByVotingId] = useState<Record<string, boolean>>({});
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  useEffect(() => {
    const loadUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        setUser(session?.user ?? null);
      } finally {
        setLoadingUser(false);
      }
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoadingUser(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const loadBetCounts = async () => {
      try {
        const response = await fetch('/api/votacoes/bet-counts', { method: 'GET', cache: 'no-store' });
        const payload = (await response.json()) as { counts?: BetCountsMap };
        setBetCounts(payload.counts || {});
      } catch {
        setBetCounts({});
      }
    };

    void loadBetCounts();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const votacaoIds = votacoes.map((votacao) => votacao.id).filter(Boolean);

    if (votacaoIds.length === 0) {
      return;
    }

    const missingIds = votacaoIds.filter((votacaoId) => commentsByVotingId[votacaoId] === undefined);
    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;

    const preloadCommentCounts = async () => {
      try {
        const responses = await Promise.all(
          missingIds.map(async (votacaoId) => {
            const response = await fetch(`/api/votacoes/comments?votacaoId=${encodeURIComponent(votacaoId)}`, {
              method: 'GET',
              cache: 'no-store',
            });

            const payload = (await response.json()) as { comments?: BetCommentItem[] };
            return {
              votacaoId,
              comments: response.ok && Array.isArray(payload.comments) ? payload.comments : [],
            };
          })
        );

        if (cancelled) {
          return;
        }

        setCommentsByVotingId((current) => {
          const next = { ...current };

          for (const item of responses) {
            next[item.votacaoId] = item.comments;
          }

          return next;
        });
      } catch {
        // Mantém o contador em zero se o preload falhar.
      }
    };

    void preloadCommentCounts();

    return () => {
      cancelled = true;
    };
  }, [commentsByVotingId, votacoes]);

  const filteredVotacoes = useMemo(() => {
    return votacoes
      .filter((votacao) => {
        const metadata = parsePollMetadata(votacao.descricao);

        if (selectedCategory === 'todos') return true;
        return metadata.categoria === selectedCategory;
      })
      .sort((left, right) => {
        const leftMetadata = parsePollMetadata(left.descricao);
        const rightMetadata = parsePollMetadata(right.descricao);
        const leftCloseAtMs = leftMetadata.encerramentoAposta ? new Date(leftMetadata.encerramentoAposta).getTime() : NaN;
        const rightCloseAtMs = rightMetadata.encerramentoAposta ? new Date(rightMetadata.encerramentoAposta).getTime() : NaN;
        const leftClosed = left.ativa === false || (Number.isFinite(leftCloseAtMs) && leftCloseAtMs <= nowTimestamp);
        const rightClosed = right.ativa === false || (Number.isFinite(rightCloseAtMs) && rightCloseAtMs <= nowTimestamp);

        if (leftClosed !== rightClosed) {
          return leftClosed ? 1 : -1;
        }

        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });
  }, [nowTimestamp, selectedCategory, votacoes]);

  const parsedBetAmount = Number(betAmount.replace(',', '.'));
  const potentialReturn = Number.isFinite(parsedBetAmount) && parsedBetAmount > 0 && betModal
    ? parsedBetAmount * betModal.odd
    : 0;

  const updateCategory = (value: CategoryValue) => {
    setSelectedCategory(value);
    const nextUrl = value === 'todos' ? pathname : `${pathname}?category=${value}`;
    router.replace(nextUrl, { scroll: false });
  };

  const buildCurrentUrl = () => {
    const currentQuery = searchParams?.toString();
    return currentQuery ? `${pathname}?${currentQuery}` : pathname;
  };

  const requireAuthenticatedSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !session.user) {
      setUser(null);
      router.push(`/login?next=${encodeURIComponent(buildCurrentUrl())}`);
      return null;
    }

    if (!user || user.id !== session.user.id) {
      setUser(session.user);
    }

    return session;
  };

  const loadComments = async (votacaoId: string) => {
    setLoadingCommentsByVotingId((current) => ({ ...current, [votacaoId]: true }));

    try {
      const response = await fetch(`/api/votacoes/comments?votacaoId=${encodeURIComponent(votacaoId)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json()) as { comments?: BetCommentItem[]; error?: string };

      if (!response.ok) {
        setCommentStatusByVotingId((current) => ({
          ...current,
          [votacaoId]: payload.error || 'Não foi possível carregar os comentários.',
        }));
        return;
      }

      setCommentsByVotingId((current) => ({
        ...current,
        [votacaoId]: Array.isArray(payload.comments) ? payload.comments : [],
      }));
      setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: null }));
    } catch {
      setCommentStatusByVotingId((current) => ({
        ...current,
        [votacaoId]: 'Não foi possível carregar os comentários.',
      }));
    } finally {
      setLoadingCommentsByVotingId((current) => ({ ...current, [votacaoId]: false }));
    }
  };

  const toggleComments = async (votacaoId: string) => {
    const shouldOpen = expandedCommentsId !== votacaoId;
    setExpandedCommentsId(shouldOpen ? votacaoId : null);

    if (shouldOpen && commentsByVotingId[votacaoId] === undefined) {
      await loadComments(votacaoId);
    }
  };

  const submitComment = async (votacaoId: string) => {
    const message = String(commentDraftByVotingId[votacaoId] || '').trim();

    const session = await requireAuthenticatedSession();
    if (!session) return;

    if (!message) {
      setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: 'Digite um comentário.' }));
      return;
    }

    try {
      if (!session?.access_token) {
        setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: 'Sessão inválida. Faça login novamente.' }));
        return;
      }

      setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: 'Enviando comentário...' }));

      const response = await fetch('/api/votacoes/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ votacaoId, message }),
      });

      const payload = (await response.json()) as { comment?: BetCommentItem; error?: string };

      const nextComment = payload.comment;

      if (!response.ok || !nextComment) {
        setCommentStatusByVotingId((current) => ({
          ...current,
          [votacaoId]: payload.error || 'Não foi possível publicar o comentário.',
        }));
        return;
      }

      setCommentsByVotingId((current) => ({
        ...current,
        [votacaoId]: [...(current[votacaoId] || []), nextComment],
      }));
      setCommentDraftByVotingId((current) => ({ ...current, [votacaoId]: '' }));
      setCommentStatusByVotingId((current) => ({ ...current, [votacaoId]: 'Comentário publicado.' }));
    } catch {
      setCommentStatusByVotingId((current) => ({
        ...current,
        [votacaoId]: 'Não foi possível publicar o comentário.',
      }));
    }
  };

  const openBetModal = (votacao: VotingRecord, option: PollOption) => {
    void (async () => {
      const session = await requireAuthenticatedSession();
      if (!session) return;

    const metadata = parsePollMetadata(votacao.descricao);
    const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
    const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();
    if (isBetClosed) {
      alert('O prazo para apostar nesta votação já foi encerrado.');
      return;
    }

    const odd = Number(option.odds);
    if (option.odds === '' || !Number.isFinite(odd) || odd <= 0) {
      alert('Esta opção ainda não possui odd configurada.');
      return;
    }

    setUser(session.user);
    setBetModal({
      votacaoId: votacao.id,
      votacaoTitulo: votacao.titulo,
      candidato: option.label,
      odd,
      imageUrl: option.imageUrl,
    });
    setBetAmount('');
    setBetFeedback(null);
    })();
  };

  const handlePlaceBet = async () => {
    if (!betModal) return;

    if (!user) {
      router.push(`/login?next=${encodeURIComponent(buildCurrentUrl())}`);
      return;
    }

    const rawBalance = user.user_metadata?.balance ?? user.user_metadata?.saldo ?? 0;
    const parsedBalance = typeof rawBalance === 'number' ? rawBalance : Number(String(rawBalance).replace(',', '.'));
    const userBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;

    const amount = Number(betAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBetFeedback('Digite um valor válido para apostar.');
      return;
    }

    if (!Number.isFinite(userBalance) || amount > userBalance) {
      setBetFeedback('Saldo insuficiente para essa aposta.');
      return;
    }

    setPlacingBet(true);
    setBetFeedback(null);

    try {
      const existingBets = Array.isArray(user.user_metadata?.bets) ? user.user_metadata.bets : [];
      const nextBalance = Math.round((userBalance - amount) * 100) / 100;
      const nextBets = [
        ...existingBets,
        {
          id: crypto.randomUUID(),
          votacaoId: betModal.votacaoId,
          votacaoTitulo: betModal.votacaoTitulo,
          candidato: betModal.candidato,
          odd: betModal.odd,
          amount,
          potentialReturn: Math.round(amount * betModal.odd * 100) / 100,
          createdAt: new Date().toISOString(),
        },
      ];

      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          balance: nextBalance,
          bets: nextBets,
        },
      });

      if (error) {
        setBetFeedback(`Erro ao registrar aposta: ${error.message}`);
        return;
      }

      if (data.user) {
        setUser(data.user);
      }

      try {
        const response = await fetch('/api/votacoes/bet-counts', { method: 'GET', cache: 'no-store' });
        const payload = (await response.json()) as { counts?: BetCountsMap };
        setBetCounts(payload.counts || {});
      } catch {
        setBetCounts((current) => current);
      }

      setBetFeedback('Aposta registrada com sucesso.');
      setTimeout(() => {
        setBetModal(null);
        setBetAmount('');
        setBetFeedback(null);
      }, 900);
    } catch {
      setBetFeedback('Erro ao registrar aposta. Tente novamente.');
    } finally {
      setPlacingBet(false);
    }
  };

  const getCategoryLabel = (categoria: string) => {
    return categories.find((option) => option.value === categoria)?.label || 'Sem categoria';
  };

  return (
    <>
      <div className="mb-6">
        <CategoryCarousel
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={(value) => updateCategory(value as CategoryValue)}
          basePath={pathname}
          variant="dark"
        />
      </div>

      {filteredVotacoes.length === 0 ? (
        <div className="text-cyan-200 text-center py-8 rounded-xl bg-cyan-900/30 border border-cyan-700">
          <p>
            {selectedCategory === 'todos'
              ? 'Nenhuma votação disponível no momento. Volte em breve!'
              : `Nenhuma votação encontrada na categoria ${getCategoryLabel(selectedCategory)}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-4 pb-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:pb-12">
          {filteredVotacoes.map((votacao) => {
            const metadata = parsePollMetadata(votacao.descricao);
            const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
            const isBetClosed = votacao.ativa === false || (Number.isFinite(closeAtMs) && closeAtMs <= Date.now());
            const description = getCardDescription(metadata.descricaoLimpa);
            const isDescriptionExpanded = Boolean(expandedDescriptionByVotingId[votacao.id]);
            const shouldCollapseDescription = description.length > DESCRIPTION_PREVIEW_LENGTH;
            const displayedDescription =
              shouldCollapseDescription && !isDescriptionExpanded
                ? `${description.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()}...`
                : description;
            const parsedOptions = Array.isArray(votacao.opcoes)
              ? votacao.opcoes.map((opcao) => parsePollOption(opcao)).filter((option) => option.label || option.odds)
              : [];
            const votes = parsedOptions.map((option, idx) => {
              const baseVotes = getSimulatedBaseBets(votacao.id, option, idx);
              const realVotes = getRealBetCount(betCounts, votacao.id, option.label);
              return baseVotes + realVotes;
            });
            const totalVotes = votes.reduce((acc, current) => acc + current, 0);

            return (
              <div
                key={votacao.id}
                className="flex h-full min-h-[420px] flex-col rounded-2xl border border-white/10 bg-[#171b22] p-4 shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-green-500/30 hover:shadow-[0_0_25px_rgba(34,197,94,0.08)]"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <span className="text-xs text-zinc-400">
                    {getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 text-xs font-semibold ${
                      isBetClosed ? 'text-zinc-500' : 'text-yellow-400'
                    }`}
                  >
                    {!isBetClosed && (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400/80" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-300" />
                      </span>
                    )}
                    {isBetClosed ? 'ENCERRADA' : 'AO VIVO'}
                  </span>
                </div>

                <h3 className="mb-2 break-words text-sm font-semibold text-white">{votacao.titulo}</h3>
                <div className="mb-4">
                  <p className="break-words text-sm leading-6 text-zinc-400">{displayedDescription}</p>
                  {shouldCollapseDescription && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDescriptionByVotingId((current) => ({
                          ...current,
                          [votacao.id]: !current[votacao.id],
                        }))
                      }
                      className="mt-2 text-xs font-semibold text-green-400 transition hover:text-green-300"
                    >
                      {isDescriptionExpanded ? 'Mostrar menos' : 'Ler tudo'}
                    </button>
                  )}
                </div>
                <p className="mb-4 text-xs text-zinc-400">
                  Encerra em:{' '}
                  {metadata.encerramentoAposta
                    ? new Date(metadata.encerramentoAposta).toLocaleString('pt-BR')
                    : 'Não definido'}
                </p>

                <div className="flex-1">
                {parsedOptions.length > 0 ? (
                  <div className="space-y-2.5">
                    {parsedOptions.map((parsedOption, idx) => {
                      const percent = totalVotes > 0 ? Math.max(1, Math.round((votes[idx] / totalVotes) * 100)) : 0;
                      const optionInitial = parsedOption.label.slice(0, 1).toUpperCase() || '?';

                      return (
                        <button
                          key={`${votacao.id}-${parsedOption.label || idx}`}
                          type="button"
                          onClick={() => openBetModal(votacao, parsedOption)}
                          disabled={isBetClosed || parsedOption.odds === ''}
                          className="w-full rounded-2xl border border-white/10 bg-[#11151b] px-3 py-3 text-left transition-all duration-200 hover:border-green-500/20 hover:bg-[#151a22] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1a1f28]">
                                {parsedOption.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={parsedOption.imageUrl}
                                    alt={parsedOption.label || `Opção ${idx + 1}`}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-xs font-semibold text-white">{optionInitial}</span>
                                )}
                              </div>
                              <span className="truncate text-sm font-semibold text-white">
                                {parsedOption.label || `Opção ${idx + 1}`}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                              <span className="rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400">
                                {getDisplayedOdd(parsedOption.odds)}
                              </span>
                              <span className="rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-400">
                                {percent}%
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <p className="mt-2 text-[11px] text-zinc-400">{votes[idx]} apostas</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-[#11151b] px-3 py-3 text-xs text-zinc-400">
                    Nenhuma opção disponível para esta votação no momento.
                  </p>
                )}
                </div>
                <div className="mt-4 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => void toggleComments(votacao.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-green-500/30 hover:bg-white/10"
                  >
                    <span>Comentários</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-zinc-300">
                      {(commentsByVotingId[votacao.id] || []).length}
                    </span>
                  </button>

                  {expandedCommentsId === votacao.id && (
                    <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-[#11151b] p-3">
                      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                        {loadingCommentsByVotingId[votacao.id] ? (
                          <p className="text-xs text-zinc-400">Carregando comentários...</p>
                        ) : (commentsByVotingId[votacao.id] || []).length > 0 ? (
                          (commentsByVotingId[votacao.id] || []).map((comment) => (
                            <div key={comment.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-white">{comment.username}</span>
                                <span className="text-[11px] text-zinc-500">
                                  {new Date(comment.created_at).toLocaleString('pt-BR')}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-zinc-300">{comment.message}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-zinc-400">Ainda não há comentários neste mercado.</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <textarea
                          value={commentDraftByVotingId[votacao.id] || ''}
                          onChange={(event) =>
                            setCommentDraftByVotingId((current) => ({
                              ...current,
                              [votacao.id]: event.target.value,
                            }))
                          }
                          onFocus={() => {
                            if (!user) {
                              router.push(`/login?next=${encodeURIComponent(buildCurrentUrl())}`);
                            }
                          }}
                          onClick={() => {
                            if (!user) {
                              router.push(`/login?next=${encodeURIComponent(buildCurrentUrl())}`);
                            }
                          }}
                          rows={3}
                          placeholder={user ? 'Compartilhe sua leitura desse mercado...' : 'Faça login para comentar'}
                          disabled={!user}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-zinc-500">
                            {commentStatusByVotingId[votacao.id] || (user ? '' : 'Entre na sua conta para comentar neste mercado.')}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (user) {
                                void submitComment(votacao.id);
                                return;
                              }

                              router.push(`/login?next=${encodeURIComponent(buildCurrentUrl())}`);
                            }}
                            className="rounded-full bg-green-500 px-3 py-1.5 text-xs font-semibold text-[#0f1115] transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {user ? 'Comentar' : 'Entrar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {betModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/86 p-4 backdrop-blur-md">
          <div className="flex w-full max-w-[25rem] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#08111f] shadow-[0_32px_100px_rgba(2,6,23,0.72)] sm:max-w-[28rem] sm:rounded-[32px]">
            <div className="bg-[linear-gradient(145deg,#07111f_0%,#0f1f3d_42%,#0a84b7_100%)] px-5 pb-4 pt-4 text-white sm:px-6 sm:pb-5 sm:pt-5">
              <button
                type="button"
                onClick={() => {
                  setBetModal(null);
                  setBetAmount('');
                  setBetFeedback(null);
                }}
                className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-50 transition hover:bg-white/15"
              >
                Voltar
              </button>
              <p className="mt-2 text-lg font-semibold leading-tight text-white sm:mt-3 sm:text-[1.65rem]">{betModal.votacaoTitulo}</p>
              <p className="mt-1 text-sm text-blue-50/85">Revise os dados antes de confirmar sua posição.</p>
            </div>

            <div className="max-h-[58vh] overflow-y-auto bg-[linear-gradient(180deg,#eff5fc_0%,#ffffff_18%,#f7fbff_100%)] p-3.5 sm:max-h-[56vh] sm:p-4">
              <div className="-mt-8 rounded-[24px] border border-white/90 bg-white p-3.5 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.45)] sm:-mt-10 sm:rounded-[28px] sm:p-4">
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50 shadow-sm sm:h-16 sm:w-16 sm:rounded-[20px]">
                    {betModal.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={betModal.imageUrl} alt={betModal.candidato} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-base font-bold text-cyan-700 sm:text-lg">{betModal.candidato.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Escolha confirmada</p>
                    <p className="mt-1 text-base font-semibold leading-tight text-slate-950 sm:text-lg">{betModal.candidato}</p>
                  </div>
                </div>
                <div className="mt-3 inline-flex rounded-[16px] border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold tabular-nums text-emerald-800 sm:rounded-[18px] sm:px-3.5 sm:py-1.5 sm:text-sm">
                  {betModal.odd.toFixed(2)}x
                </div>
              </div>

              <label className="mt-4 block text-sm font-semibold text-slate-800 sm:mt-5">Valor da aposta</label>
              <div className="mt-2.5 flex items-center rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] focus-within:border-cyan-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-cyan-100 sm:py-3.5">
                <span className="text-sm font-bold text-cyan-700 sm:text-base">R$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={betAmount}
                  onChange={(event) => setBetAmount(event.target.value)}
                  placeholder={user ? 'Ex: 25' : 'Entre para apostar'}
                  disabled={!user && !loadingUser}
                  className="w-full border-0 bg-transparent px-3 text-base font-semibold text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400 sm:text-lg"
                />
              </div>

              {user ? (
                <>
                  <div className="mt-4 grid gap-2.5 rounded-[22px] border border-slate-200 bg-[#f8fbff] p-3 text-sm shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] sm:rounded-[24px] sm:p-4">
                    <div className="rounded-[18px] border border-cyan-200 bg-cyan-50 px-3.5 py-3 shadow-sm">
                      <span>Retorno estimado</span>
                      <span className="mt-1.5 block text-base font-bold tabular-nums text-cyan-900 sm:text-lg">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialReturn)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-3.5 rounded-[18px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-800">
                  Faça login para apostar nesta votação e salvar seu histórico.
                </div>
              )}

              {betFeedback && (
                <p
                  className={`mt-4 rounded-[18px] px-4 py-2.5 text-sm font-medium ${
                    betFeedback.includes('sucesso') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {betFeedback}
                </p>
              )}

              <div className="mt-4 flex gap-3 sm:mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setBetModal(null);
                    setBetAmount('');
                    setBetFeedback(null);
                  }}
                  className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handlePlaceBet()}
                  disabled={placingBet || loadingUser}
                  className="flex-1 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#0f5ae0_42%,#0ea5a4_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_-20px_rgba(14,116,144,0.8)] transition hover:brightness-105 disabled:opacity-60"
                >
                  {user ? (placingBet ? 'Enviando...' : 'Confirmar aposta') : 'Entrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

