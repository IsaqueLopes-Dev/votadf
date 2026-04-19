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
    // Compatibilidade com opções em texto puro.
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

const getDisplayedOdd = (value: string) => (value === '' ? '-' : value);

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
    return votacoes.filter((votacao) => {
      const metadata = parsePollMetadata(votacao.descricao);
      const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
      const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= nowTimestamp;

      if (isBetClosed) return false;
      if (selectedCategory === 'todos') return true;
      return metadata.categoria === selectedCategory;
    });
  }, [nowTimestamp, selectedCategory, votacoes]);

  const rawBalance = user?.user_metadata?.balance ?? user?.user_metadata?.saldo ?? 0;
  const parsedBalance = typeof rawBalance === 'number' ? rawBalance : Number(String(rawBalance).replace(',', '.'));
  const userBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
  const formattedUserBalance = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(userBalance);

  const parsedBetAmount = Number(betAmount.replace(',', '.'));
  const potentialReturn = Number.isFinite(parsedBetAmount) && parsedBetAmount > 0 && betModal
    ? parsedBetAmount * betModal.odd
    : 0;
  const potentialProfit = Number.isFinite(parsedBetAmount) && parsedBetAmount > 0
    ? Math.max(potentialReturn - parsedBetAmount, 0)
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
              ? 'Nenhuma votacao ativa no momento. Volte em breve!'
              : `Nenhuma votacao ativa na categoria ${getCategoryLabel(selectedCategory)}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredVotacoes.map((votacao) => {
            const metadata = parsePollMetadata(votacao.descricao);
            const closeAtMs = metadata.encerramentoAposta ? new Date(metadata.encerramentoAposta).getTime() : NaN;
            const isBetClosed = Number.isFinite(closeAtMs) && closeAtMs <= Date.now();

            return (
              <div
                key={votacao.id}
                className="min-h-[180px] rounded-2xl border border-white/10 bg-[#171b22] p-4 shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-green-500/30 hover:shadow-[0_0_25px_rgba(34,197,94,0.08)]"
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

                <h3 className="mb-2 text-sm font-semibold text-white">{votacao.titulo}</h3>
                <p className="mb-4 line-clamp-3 text-sm leading-6 text-zinc-400">
                  {metadata.descricaoLimpa}
                </p>
                <p className="mb-4 text-xs text-zinc-400">
                  Encerra em:{' '}
                  {metadata.encerramentoAposta
                    ? new Date(metadata.encerramentoAposta).toLocaleString('pt-BR')
                    : 'Nao definido'}
                </p>

                {metadata.tipo === 'enquete-candidatos' ? (
                  <div className="space-y-2.5">
                    {Array.isArray(votacao.opcoes) &&
                      (() => {
                        const parsedOptions = votacao.opcoes.map((candidato) => parsePollOption(candidato));
                        const votes = parsedOptions.map((option, idx) => {
                          const baseVotes = getSimulatedBaseBets(votacao.id, option, idx);
                          const realVotes = getRealBetCount(betCounts, votacao.id, option.label);
                          return baseVotes + realVotes;
                        });
                        const totalVotes = votes.reduce((acc, current) => acc + current, 0);

                        return parsedOptions.map((parsedOption, idx) => {
                          const percent = totalVotes > 0 ? Math.max(1, Math.round((votes[idx] / totalVotes) * 100)) : 0;

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => openBetModal(votacao, parsedOption)}
                              disabled={isBetClosed}
                              className="w-full rounded-2xl border border-white/10 bg-[#11151b] px-3 py-3 text-left transition-all duration-200 hover:border-green-500/20 hover:bg-[#151a22] disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1a1f28]">
                                    {parsedOption.imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={parsedOption.imageUrl} alt={parsedOption.label} className="h-full w-full object-cover" />
                                    ) : (
                                      <span className="text-xs font-semibold text-white">
                                        {parsedOption.label.slice(0, 1).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm font-semibold text-white">{parsedOption.label}</span>
                                </div>
                                <div className="flex gap-2">
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
                        });
                      })()}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(votacao.opcoes) &&
                      votacao.opcoes.map((opcao, idx) => {
                        const parsedOption = parsePollOption(opcao);
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-2 rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400"
                          >
                            {parsedOption.label}
                          </span>
                        );
                      })}
                  </div>
                )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_32px_90px_-44px_rgba(15,23,42,0.55)]">
            <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_58%,#22c55e_100%)] px-5 pb-5 pt-5 text-white">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-50">
                Confirmar aposta
              </div>
              <p className="mt-3 text-lg font-bold text-white">{betModal.votacaoTitulo}</p>
              <p className="mt-1 text-sm text-blue-50/85">Revise os dados antes de confirmar sua posição.</p>
            </div>

            <div className="overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-5">
              <div className="-mt-10 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.4)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Seleção</p>
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {betModal.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={betModal.imageUrl} alt={betModal.candidato} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-cyan-700">{betModal.candidato.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <p className="text-base font-bold text-slate-900">{betModal.candidato}</p>
                </div>
                <div className="mt-3 inline-flex rounded-2xl bg-emerald-50 px-3 py-1.5 text-xs font-extrabold tabular-nums text-emerald-700">
                  {betModal.odd.toFixed(2)}
                </div>
              </div>

              <label className="mt-5 block text-sm font-semibold text-slate-700">Valor da aposta</label>
              <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <span className="text-sm font-bold text-blue-700">R$</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={betAmount}
                  onChange={(event) => setBetAmount(event.target.value)}
                  placeholder={user ? 'Ex: 25' : 'Entre para apostar'}
                  disabled={!user && !loadingUser}
                  className="w-full border-0 bg-transparent px-2 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                />
              </div>

              {user ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[10, 25, 50, 100].map((value) => {
                      const disabled = value > Math.max(userBalance, 0);
                      const currentValue = Number(betAmount.replace(',', '.'));
                      const isActive = Number.isFinite(currentValue) && currentValue === value;

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setBetAmount(String(value))}
                          disabled={disabled}
                          className={`rounded-2xl border px-2.5 py-2 text-xs font-bold tabular-nums transition ${
                            disabled
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : isActive
                                ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)}
                        </button>
                      );
                    })}

                    {userBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => setBetAmount(String(Math.floor(userBalance * 100) / 100))}
                        className="col-span-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 sm:col-span-4"
                      >
                        Usar saldo máximo
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid gap-2 rounded-[24px] border border-slate-200 bg-white p-4 text-xs shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] sm:text-sm">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Saldo disponível</span>
                      <span className="font-semibold text-slate-900">{formattedUserBalance}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Retorno estimado</span>
                      <span className="font-bold tabular-nums text-cyan-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialReturn)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Lucro potencial</span>
                      <span className="font-bold tabular-nums text-blue-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(potentialProfit)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Faça login para apostar nesta votacao e salvar seu historico.
                </div>
              )}

              {betFeedback && (
                <p
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${
                    betFeedback.includes('sucesso') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {betFeedback}
                </p>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setBetModal(null);
                    setBetAmount('');
                    setBetFeedback(null);
                  }}
                  className="flex-1 rounded-full border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handlePlaceBet()}
                  disabled={placingBet || loadingUser}
                  className="flex-1 rounded-full bg-[linear-gradient(135deg,#2563eb_0%,#06b6d4_55%,#22c55e_100%)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60"
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
