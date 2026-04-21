'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabaseClient';
import CategoryIcon from './category-icon';
import UiverseLoader from './uiverse-loader';
import {
  getCategoryLabel,
  parsePollMetadata,
  parsePollOption,
  type PollOption,
  type VotingRecord,
} from '../utils/voting-market';

type BitcoinDirection = 'Sobe' | 'Desce';

type BitcoinBetItem = {
  id: string;
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  amount: number;
  potentialReturn: number;
  createdAt: string;
  roundId?: string;
  marketType?: string;
  status?: 'aguardando' | 'ganhou' | 'perdeu';
  result?: string;
  settledAt?: string;
  payoutAmount?: number;
};

type BitcoinRoundState = {
  roundId: string;
  timeLeft: number;
  cooldownLeft: number;
  status: 'running' | 'cooldown';
  points: number[];
  currentDirection: BitcoinDirection;
  result: BitcoinDirection | null;
};

type BitcoinEntertainmentMarketProps = {
  votacao: VotingRecord;
};

const ROUND_DURATION_SECONDS = 300;
const BETTING_CLOSES_AT_SECONDS = 60;
const ROUND_RESET_DELAY_SECONDS = 10;
const GRAPH_POINT_COUNT = 28;
const DEFAULT_ODD = 1.8;

const createRoundId = () =>
  `btc-round-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatTime = (value: number) => {
  const safeValue = Math.max(0, value);
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const clampPrice = (value: number) => {
  return Math.max(20, Number(value.toFixed(2)));
};

const buildPriceStep = (previous: number, preferredDirection?: BitcoinDirection) => {
  const randomDirection =
    preferredDirection || (Math.random() >= 0.5 ? 'Sobe' : 'Desce');
  const signedDelta =
    (randomDirection === 'Sobe' ? 1 : -1) * (0.45 + Math.random() * 2.2);
  const next = clampPrice(previous + signedDelta);

  if (next !== previous) {
    return next;
  }

  return clampPrice(previous + (randomDirection === 'Sobe' ? 0.15 : -0.15));
};

const createInitialPoints = () => {
  const points = [100];

  for (let index = 1; index < GRAPH_POINT_COUNT; index += 1) {
    const previous = points[index - 1];
    points.push(buildPriceStep(previous));
  }

  return points;
};

const createInitialRoundState = (): BitcoinRoundState => {
  const points = createInitialPoints();
  const lastPoint = points[points.length - 1];
  const previousPoint = points[points.length - 2] ?? lastPoint - 0.1;

  return {
    roundId: createRoundId(),
    timeLeft: ROUND_DURATION_SECONDS,
    cooldownLeft: ROUND_RESET_DELAY_SECONDS,
    status: 'running',
    points,
    currentDirection: lastPoint >= previousPoint ? 'Sobe' : 'Desce',
    result: null,
  };
};

const buildGraphPath = (points: number[]) => {
  if (points.length === 0) return '';

  const maxValue = Math.max(...points);
  const minValue = Math.min(...points);
  const range = Math.max(1, maxValue - minValue);
  const width = 100;
  const height = 100;

  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const normalized = (point - minValue) / range;
      const y = height - normalized * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

const normalizeRoundBets = (user: User | null, votacaoId: string) => {
  const rawBets = Array.isArray(user?.user_metadata?.bets)
    ? (user?.user_metadata?.bets as BitcoinBetItem[])
    : [];

  return rawBets
    .filter((bet) => bet.votacaoId === votacaoId && bet.marketType === 'bitcoin-direction')
    .sort(
      (left, right) =>
        new Date(right.createdAt || '').getTime() - new Date(left.createdAt || '').getTime()
    );
};

export default function BitcoinEntertainmentMarket({
  votacao,
}: BitcoinEntertainmentMarketProps) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const metadata = parsePollMetadata(votacao.descricao);
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [placingBet, setPlacingBet] = useState<BitcoinDirection | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [betMessage, setBetMessage] = useState<string | null>(null);
  const [round, setRound] = useState<BitcoinRoundState>(() => createInitialRoundState());
  const settlingRoundsRef = useRef<Set<string>>(new Set());

  const options = useMemo(() => {
    const parsedOptions = Array.isArray(votacao.opcoes)
      ? votacao.opcoes
          .map((option) => parsePollOption(option))
          .filter((option) => option.label || option.odds)
      : [];

    const findDirectionOption = (direction: BitcoinDirection, fallbackIndex: number): PollOption => {
      const matched = parsedOptions.find((option) =>
        option.label.trim().toLowerCase().includes(direction === 'Sobe' ? 'sobe' : 'desce')
      );

      if (matched) {
        return matched;
      }

      const fallback = parsedOptions[fallbackIndex];
      if (fallback) {
        return fallback;
      }

      return {
        label: direction,
        imageUrl: '',
        odds: String(DEFAULT_ODD),
        oddsNao: '',
      };
    };

    const sobeOption = findDirectionOption('Sobe', 0);
    const desceOption = findDirectionOption('Desce', 1);

    return {
      Sobe: {
        label: 'Sobe',
        imageUrl: sobeOption.imageUrl,
        odd:
          Number.isFinite(Number(sobeOption.odds)) && Number(sobeOption.odds) > 0
            ? Number(sobeOption.odds)
            : DEFAULT_ODD,
      },
      Desce: {
        label: 'Desce',
        imageUrl: desceOption.imageUrl,
        odd:
          Number.isFinite(Number(desceOption.odds)) && Number(desceOption.odds) > 0
            ? Number(desceOption.odds)
            : DEFAULT_ODD,
      },
    };
  }, [votacao.opcoes]);

  const currentBalance = Number(user?.user_metadata?.balance ?? user?.user_metadata?.saldo ?? 0) || 0;
  const isBettingOpen = round.status === 'running' && round.timeLeft > BETTING_CLOSES_AT_SECONDS;
  const currentDirection = round.currentDirection;
  const graphPath = useMemo(() => buildGraphPath(round.points), [round.points]);
  const lineColor =
    currentDirection === 'Sobe' ? '#22c55e' : '#ef4444';
  const userRoundBets = useMemo(() => normalizeRoundBets(user, votacao.id), [user, votacao.id]);
  const currentRoundBet =
    userRoundBets.find((bet) => bet.roundId === round.roundId && (bet.status || 'aguardando') === 'aguardando') ||
    null;

  useEffect(() => {
    router.prefetch('/home');
  }, [router]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        setUser(session?.user ?? null);
      } finally {
        setLoadingUser(false);
      }
    };

    void loadSession();

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
    const timerId = window.setTimeout(() => {
      setRound((current) => {
        if (current.status === 'cooldown') {
          if (current.cooldownLeft <= 1) {
            return createInitialRoundState();
          }

          return {
            ...current,
            cooldownLeft: current.cooldownLeft - 1,
          };
        }

        if (current.timeLeft <= 1) {
          const currentPoints = current.points.slice();
          const latestPoint = currentPoints[currentPoints.length - 1] ?? 100;
          const previousPoint =
            currentPoints[currentPoints.length - 2] ?? latestPoint - 0.15;

          if (latestPoint === previousPoint) {
            currentPoints[currentPoints.length - 1] = buildPriceStep(
              previousPoint,
              current.currentDirection
            );
          }

          const finalPoint = currentPoints[currentPoints.length - 1] ?? latestPoint;
          const finalPreviousPoint =
            currentPoints[currentPoints.length - 2] ?? previousPoint;
          const finalDirection: BitcoinDirection =
            finalPoint > finalPreviousPoint ? 'Sobe' : 'Desce';

          return {
            ...current,
            status: 'cooldown',
            timeLeft: 0,
            cooldownLeft: ROUND_RESET_DELAY_SECONDS,
            points: currentPoints,
            currentDirection: finalDirection,
            result: finalDirection,
          };
        }

        const nextPoints = current.points.slice();
        const previous = nextPoints[nextPoints.length - 1] ?? 100;
        const nextValue = buildPriceStep(previous);
        nextPoints.push(nextValue);

        if (nextPoints.length > GRAPH_POINT_COUNT) {
          nextPoints.shift();
        }

        return {
          ...current,
          timeLeft: current.timeLeft - 1,
          points: nextPoints,
          currentDirection: nextValue > previous ? 'Sobe' : 'Desce',
        };
      });
    }, 1000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [round]);

  useEffect(() => {
    const settleRoundForUser = async () => {
      if (!round.result || !user || settlingRoundsRef.current.has(round.roundId)) {
        return;
      }

      settlingRoundsRef.current.add(round.roundId);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          return;
        }

        const metadataRecord = (session.user.user_metadata || {}) as Record<string, unknown>;
        const metadataBets = Array.isArray(metadataRecord.bets)
          ? ([...metadataRecord.bets] as BitcoinBetItem[])
          : [];
        const settledRounds = Array.isArray(metadataRecord.bitcoin_settled_round_ids)
          ? metadataRecord.bitcoin_settled_round_ids.map((item) => String(item))
          : [];

        if (settledRounds.includes(round.roundId)) {
          return;
        }

        const matchingIndexes = metadataBets
          .map((bet, index) => ({ bet, index }))
          .filter(
            ({ bet }) =>
              bet.votacaoId === votacao.id &&
              bet.marketType === 'bitcoin-direction' &&
              bet.roundId === round.roundId &&
              (bet.status || 'aguardando') === 'aguardando'
          );

        if (matchingIndexes.length === 0) {
          const { data } = await supabase.auth.updateUser({
            data: {
              ...metadataRecord,
              bitcoin_settled_round_ids: [...settledRounds, round.roundId],
            },
          });

          if (data.user) {
            setUser(data.user);
          }

          return;
        }

        let nextBalance =
          Number(metadataRecord.balance ?? metadataRecord.saldo ?? 0) || 0;

        matchingIndexes.forEach(({ bet, index }) => {
          const won = String(bet.candidato || '').trim().toLowerCase() === round.result?.toLowerCase();
          const payoutAmount = won ? Number(bet.potentialReturn || 0) : 0;

          nextBalance = Math.round((nextBalance + payoutAmount) * 100) / 100;
          metadataBets[index] = {
            ...bet,
            status: won ? 'ganhou' : 'perdeu',
            result: round.result || '',
            settledAt: new Date().toISOString(),
            payoutAmount,
          };
        });

        const { data, error } = await supabase.auth.updateUser({
          data: {
            ...metadataRecord,
            balance: nextBalance,
            bets: metadataBets,
            bitcoin_settled_round_ids: [...settledRounds, round.roundId],
          },
        });

        if (error) {
          throw error;
        }

        if (data.user) {
          setUser(data.user);
          setBetMessage(
            matchingIndexes.some(
              ({ bet }) => String(bet.candidato || '').trim().toLowerCase() === round.result?.toLowerCase()
            )
              ? `Rodada encerrada. Resultado: ${round.result}. Seu saldo foi atualizado.`
              : `Rodada encerrada. Resultado: ${round.result}.`
          );
        }
      } catch (error) {
        console.error('Erro ao liquidar rodada Bitcoin:', error);
      } finally {
        window.setTimeout(() => {
          settlingRoundsRef.current.delete(round.roundId);
        }, 1500);
      }
    };

    void settleRoundForUser();
  }, [round.result, round.roundId, supabase, user, votacao.id]);

  useEffect(() => {
    if (!isBettingOpen && round.status === 'running' && round.timeLeft === BETTING_CLOSES_AT_SECONDS) {
      setBetMessage('Apostas encerradas. Aguardando resultado...');
    }
  }, [isBettingOpen, round.status, round.timeLeft]);

  const handleBackHome = () => {
    router.push('/home');
  };

  const requireAuthenticatedSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !session.user) {
      setUser(null);
      window.location.href = `/login?next=${encodeURIComponent(`/mercados/${votacao.id}`)}`;
      return null;
    }

    if (!user || user.id !== session.user.id) {
      setUser(session.user);
    }

    return session;
  };

  const placeBitcoinBet = async (direction: BitcoinDirection) => {
    if (!isBettingOpen || round.status !== 'running') {
      setBetMessage('Apostas encerradas. Aguardando resultado...');
      return;
    }

    const session = await requireAuthenticatedSession();
    if (!session?.user) return;

    const amount = Number(betAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBetMessage('Digite um valor valido para apostar.');
      return;
    }

    const metadataRecord = (session.user.user_metadata || {}) as Record<string, unknown>;
    const metadataBets = Array.isArray(metadataRecord.bets)
      ? ([...metadataRecord.bets] as BitcoinBetItem[])
      : [];
    const currentRoundBetIndex = metadataBets.findIndex(
      (bet) =>
        bet.votacaoId === votacao.id &&
        bet.marketType === 'bitcoin-direction' &&
        bet.roundId === round.roundId &&
        (bet.status || 'aguardando') === 'aguardando'
    );
    const existingRoundBet =
      currentRoundBetIndex >= 0 ? metadataBets[currentRoundBetIndex] : null;
    const currentAvailableBalance =
      Number(metadataRecord.balance ?? metadataRecord.saldo ?? 0) || 0;
    const restorableAmount = existingRoundBet ? Number(existingRoundBet.amount || 0) : 0;
    const adjustedAvailableBalance = currentAvailableBalance + restorableAmount;

    if (amount > adjustedAvailableBalance) {
      setBetMessage('Saldo insuficiente para essa aposta.');
      return;
    }

    setPlacingBet(direction);
    setBetMessage(null);

    try {
      const option = options[direction];
      const nextBalance = Math.round((adjustedAvailableBalance - amount) * 100) / 100;
      const nextBet: BitcoinBetItem = {
        id: existingRoundBet?.id || crypto.randomUUID(),
        votacaoId: votacao.id,
        votacaoTitulo: votacao.titulo,
        candidato: direction,
        odd: option.odd,
        amount,
        potentialReturn: Math.round(amount * option.odd * 100) / 100,
        createdAt: new Date().toISOString(),
        roundId: round.roundId,
        marketType: 'bitcoin-direction',
        status: 'aguardando',
      };

      if (currentRoundBetIndex >= 0) {
        metadataBets[currentRoundBetIndex] = nextBet;
      } else {
        metadataBets.push(nextBet);
      }

      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...metadataRecord,
          balance: nextBalance,
          bets: metadataBets,
        },
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        setUser(data.user);
      }

      setBetMessage(
        existingRoundBet
          ? `Escolha atualizada para ${direction}.`
          : `Aposta registrada em ${direction}.`
      );
    } catch (error) {
      setBetMessage(
        error instanceof Error
          ? `Erro ao registrar aposta: ${error.message}`
          : 'Erro ao registrar aposta.'
      );
    } finally {
      setPlacingBet(null);
    }
  };

  const recentPositions = userRoundBets.slice(0, 6);
  const resultLabel =
    round.result != null
      ? `Rodada encerrada. Resultado: ${round.result}`
      : isBettingOpen
        ? 'Apostas abertas'
        : 'Apostas encerradas. Aguardando resultado...';

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBackHome}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
        >
          <span aria-hidden>{'←'}</span>
          Voltar
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,#0f172a_0%,#111827_46%,#0b1120_100%)] shadow-[0_30px_100px_-55px_rgba(34,211,238,0.45)]">
            <div className="p-6 lg:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-300"
                  title={getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                  aria-label={getCategoryLabel(metadata.categoria || 'todos').replace('Todos', 'Sem categoria')}
                >
                  <CategoryIcon category={metadata.categoria || 'todos'} className="h-4.5 w-4.5" />
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold [font-family:var(--font-poppins),sans-serif] ${
                    round.result
                      ? 'bg-cyan-400 text-[#082032]'
                      : isBettingOpen
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-400 text-[#2b1600]'
                  }`}
                >
                  {resultLabel}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold text-zinc-300">
                  Tempo: {formatTime(round.timeLeft)}
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-white lg:text-4xl">
                {votacao.titulo}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-cyan-100/85 sm:text-base">
                Mercado de entretenimento baseado apenas na direcao final do grafico. Nao usa preco real e nao existe empate.
              </p>

              <div className="mt-6 rounded-[30px] border border-white/10 bg-[#0b1220] p-4 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.9)] sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                      Grafico da rodada
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Direcao atual: <span className={currentDirection === 'Sobe' ? 'text-emerald-300' : 'text-rose-300'}>{currentDirection}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      Encerramento da aposta
                    </p>
                    <p className="mt-2 text-lg font-bold text-white">01:00</p>
                  </div>
                </div>

                <div className="mt-5 rounded-[26px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_38%),linear-gradient(180deg,#050b14_0%,#0b1220_100%)] p-3 sm:p-4">
                  <svg viewBox="0 0 100 100" className="h-52 w-full sm:h-64" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="bitcoin-chart-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.65" />
                        <stop offset="100%" stopColor={lineColor} stopOpacity="1" />
                      </linearGradient>
                    </defs>
                    <path
                      d={graphPath}
                      fill="none"
                      stroke="url(#bitcoin-chart-gradient)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {!isBettingOpen && round.result == null && (
                <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-100">
                  Apostas encerradas. Aguardando resultado...
                </div>
              )}

              {round.result && (
                <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100">
                  Rodada encerrada. Resultado: {round.result}. Nova rodada em {round.cooldownLeft}s.
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {(['Sobe', 'Desce'] as BitcoinDirection[]).map((direction) => {
                  const option = options[direction];
                  const isSelected = currentRoundBet?.candidato === direction;
                  const isBusy = placingBet === direction;

                  return (
                    <button
                      key={direction}
                      type="button"
                      onClick={() => void placeBitcoinBet(direction)}
                      disabled={!isBettingOpen || isBusy}
                      className={`rounded-[24px] border px-4 py-4 text-left transition ${
                        direction === 'Sobe'
                          ? 'border-emerald-400/20 bg-emerald-500/10 hover:bg-emerald-500/15'
                          : 'border-rose-400/20 bg-rose-500/10 hover:bg-rose-500/15'
                      } ${isSelected ? 'ring-2 ring-cyan-300/60' : ''} disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-white">{direction}</p>
                          <p className="mt-1 text-xs text-zinc-300">
                            {isSelected ? 'Sua escolha atual nesta rodada' : 'Aposte na direcao final'}
                          </p>
                        </div>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white">
                          {option.odd.toFixed(2)}x
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-[24px] border border-white/10 bg-[#0f172a] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-white">Valor da aposta</label>
                  <span className="text-xs text-zinc-500">Retorno = valor x odd</span>
                </div>
                <div className="mt-3 flex items-center rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-sm font-bold text-cyan-300 sm:text-base">R$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={betAmount}
                    onChange={(event) => setBetAmount(event.target.value)}
                    placeholder="Ex: 50"
                    disabled={!isBettingOpen || placingBet !== null}
                    className="w-full border-0 bg-transparent px-3 text-base font-semibold text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:text-slate-500 sm:text-lg"
                  />
                </div>
              </div>

              {betMessage && (
                <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                  {betMessage}
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-white/10 bg-[#0f131a] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Regras da rodada</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Como funciona</h2>
              <div className="mt-4 space-y-3">
                {[
                  'Cada rodada dura 5 minutos.',
                  'As apostas ficam abertas somente ate 01:00 restante.',
                  'O grafico continua rodando normalmente ate 00:00.',
                  'O resultado final depende apenas do ultimo movimento do grafico.',
                  'Se o ultimo tick vier igual, o sistema forca uma variacao minima para garantir resultado.',
                  'Depois do encerramento, uma nova rodada comeca automaticamente em 10 segundos.',
                ].map((rule) => (
                  <div
                    key={rule}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-zinc-300"
                  >
                    {rule}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[#0f131a] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Resultado da rodada</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Painel rapido</h2>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Status</p>
                  <p className="mt-2 text-lg font-semibold text-white">{resultLabel}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Apostas</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {isBettingOpen ? 'Liberadas' : 'Bloqueadas'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Direcao atual</p>
                  <p className={`mt-2 text-lg font-semibold ${currentDirection === 'Sobe' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {currentDirection}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-[32px] border border-white/10 bg-[#0f131a] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Painel do usuario</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Sua posicao</h2>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Saldo disponivel</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                }).format(currentBalance)}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {loadingUser ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-zinc-400">
                  <UiverseLoader label="Carregando seus dados..." />
                </div>
              ) : currentRoundBet ? (
                <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Aposta da rodada</p>
                  <p className="mt-2 text-lg font-semibold text-white">{currentRoundBet.candidato}</p>
                  <p className="mt-1 text-sm text-cyan-100">
                    Entrada de{' '}
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(currentRoundBet.amount)}
                  </p>
                  <p className="mt-1 text-xs text-cyan-100/75">
                    Retorno potencial{' '}
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(currentRoundBet.potentialReturn)}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-zinc-400">
                  {user
                    ? 'Voce ainda nao fez uma aposta nesta rodada.'
                    : 'Faca login para participar desta rodada Bitcoin.'}
                </div>
              )}
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Ultimas posicoes</p>
              <div className="mt-3 space-y-3">
                {recentPositions.length > 0 ? (
                  recentPositions.map((bet) => (
                    <div
                      key={bet.id}
                      className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{bet.candidato}</p>
                        <span className="rounded-full bg-white/[0.08] px-3 py-1 text-xs font-semibold text-cyan-200">
                          {(Number(bet.odd) || DEFAULT_ODD).toFixed(2)}x
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-400">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(Number(bet.amount) || 0)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Status: {bet.status || 'aguardando'}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-zinc-400">
                    Nenhuma posicao recente para este mercado.
                  </div>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
