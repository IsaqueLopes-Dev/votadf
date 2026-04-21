'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabaseClient';
import {
  BETTING_CLOSES_AT_SECONDS,
  DEFAULT_ODD,
  formatBitcoinRoundTime,
  getBitcoinRoundSnapshot,
  type BitcoinDirection,
} from '../utils/bitcoin-round';
import {
  calculateBitcoinDynamicOdds,
  createEmptyPoolSnapshot,
  extractBitcoinAccountSnapshotFromMetadata,
  getBitcoinRoundConfiguredOdds,
  subtractBetFromPoolSnapshot,
  type BitcoinAccountSnapshot,
  type BitcoinBetItem,
  type BitcoinPoolSide,
  type BitcoinPoolSnapshot,
} from '../utils/bitcoin-market';
import CategoryIcon from './category-icon';
import {
  getCategoryLabel,
  parsePollMetadata,
  parsePollOption,
  type PollOption,
  type VotingRecord,
} from '../utils/voting-market';

type BitcoinEntertainmentMarketProps = {
  votacao: VotingRecord;
};

type BitcoinResultHistoryItem = {
  roundId: string;
  result: BitcoinDirection;
  settledAt: string;
};

type ChartPoint = {
  x: number;
  y: number;
  value: number;
};

type ChartSample = {
  id: string;
  value: number;
};

const getResultHistoryStorageKey = (votacaoId: string) => `bitcoin-result-history:${votacaoId}`;

const CHART_WIDTH = 160;
const CHART_HEIGHT = 100;
const CHART_PADDING = {
  top: 8,
  right: 18,
  bottom: 14,
  left: 6,
};
const BITCOIN_PRICE_BASELINE = 374626.13;
const BITCOIN_PRICE_PER_POINT = 210;
const BITCOIN_PRICE_MAX_STEP_PER_SECOND = 48;
const BITCOIN_PRICE_MIN_SIGNIFICANT_STEP = 12;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

const formatCurrencyValue = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const formatBitcoinPriceValue = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const convertChartValueToBitcoinPrice = (value: number) =>
  BITCOIN_PRICE_BASELINE + (value - 100) * BITCOIN_PRICE_PER_POINT;

const getChartPoints = (
  committedSamples: ChartSample[],
  liveValue: number | null,
  progress: number,
  visiblePointCount: number
): ChartPoint[] => {
  if (committedSamples.length === 0 && liveValue == null) {
    return [];
  }

  const allSamples = [
    ...committedSamples,
    ...(liveValue != null ? [{ id: 'live', value: liveValue }] : []),
  ];
  const visibleSamples = allSamples.slice(-Math.max(visiblePointCount + 2, 3));
  const values = visibleSamples.map((sample) => sample.value);
  const drawableWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const drawableHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const baseRange = Math.max(1, maxValue - minValue);
  const verticalPadding = baseRange * 0.18;
  const scaledMin = minValue - verticalPadding;
  const scaledMax = maxValue + verticalPadding;
  const range = Math.max(1, scaledMax - scaledMin);
  const slotWidth = drawableWidth / Math.max(1, visiblePointCount - 1);
  const totalPoints = allSamples.length;
  const cameraPosition = Math.max(0, totalPoints - visiblePointCount - 1 + progress);
  const points = allSamples.map((sample, index) => {
    const x = CHART_PADDING.left + index * slotWidth - cameraPosition * slotWidth;
    const normalized = (sample.value - scaledMin) / range;
    const y = CHART_PADDING.top + (1 - normalized) * drawableHeight;

    return {
      x,
      y,
      value: sample.value,
    };
  });

  return points;
};

const buildLinePath = (points: ChartPoint[]) => {
  if (points.length === 0) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
};

const buildAreaPath = (points: ChartPoint[]) => {
  if (points.length === 0) return '';

  const linePath = buildLinePath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const baselineY = CHART_HEIGHT - CHART_PADDING.bottom;

  return `${linePath} L ${lastPoint.x.toFixed(2)} ${baselineY.toFixed(2)} L ${firstPoint.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
};

const normalizeRoundBets = (bets: BitcoinBetItem[], votacaoId: string) => {
  return bets
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
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [user, setUser] = useState<User | null>(null);
  const [accountSnapshot, setAccountSnapshot] = useState<BitcoinAccountSnapshot>({
    balance: 0,
    bets: [],
    settledRoundIds: [],
  });
  const [placingBet, setPlacingBet] = useState<BitcoinDirection | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [betMessage, setBetMessage] = useState<string | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<BitcoinDirection | null>(null);
  const [isCompactChart, setIsCompactChart] = useState(false);
  const [poolSnapshot, setPoolSnapshot] = useState<BitcoinPoolSnapshot>(() => createEmptyPoolSnapshot());
  const [resultHistory, setResultHistory] = useState<BitcoinResultHistoryItem[]>([]);
  const [chartSamples, setChartSamples] = useState<ChartSample[]>([]);
  const [liveCurrentPrice, setLiveCurrentPrice] = useState<number | null>(null);
  const [liveTargetPrice, setLiveTargetPrice] = useState<number | null>(null);
  const [displayedBitcoinPrice, setDisplayedBitcoinPrice] = useState(BITCOIN_PRICE_BASELINE);
  const [chartMotionProgress, setChartMotionProgress] = useState(0);
  const settlingRoundsRef = useRef<Set<string>>(new Set());
  const chartSamplesRef = useRef<ChartSample[]>([]);
  const chartAnimationFrameRef = useRef<number | null>(null);
  const liveCurrentPriceRef = useRef<number | null>(null);
  const liveTargetPriceRef = useRef<number | null>(null);
  const liveVelocityRef = useRef(0);
  const targetVelocityRef = useRef(0);
  const displayedBitcoinPriceRef = useRef(BITCOIN_PRICE_BASELINE);
  const currentDirectionRef = useRef<BitcoinDirection>('Sobe');
  const chartMotionProgressRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const lastObservedPointRef = useRef<number | null>(null);
  const lastObservedRoundIdRef = useRef<string | null>(null);
  const round = useMemo(
    () => getBitcoinRoundSnapshot(votacao.id, votacao.created_at, nowTimestamp),
    [nowTimestamp, votacao.created_at, votacao.id]
  );

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

  const isBettingOpen = round.status === 'running' && round.timeLeft > BETTING_CLOSES_AT_SECONDS;
  const currentDirection = round.currentDirection;
  const isChartFalling = currentDirection === 'Desce';
  const chartLineColor = isChartFalling ? '#ff6b6b' : '#7cffb2';
  const chartGlowColor = isChartFalling ? '#ff8d8d' : '#8dffbc';
  const chartAreaStartColor = isChartFalling ? '#ff7a7a' : '#7cffb2';
  const chartAreaMidColor = isChartFalling ? '#ef4444' : '#37d67a';
  const chartAreaBaseColor = isChartFalling ? '#19090c' : '#0a1b14';
  const chartGlowStroke = isChartFalling ? 'rgba(255,107,107,0.24)' : 'rgba(124,255,178,0.22)';
  const chartPointHalo = isChartFalling ? 'rgba(255,107,107,0.18)' : 'rgba(124,255,178,0.18)';
  const userRoundBets = useMemo(
    () => normalizeRoundBets(accountSnapshot.bets, votacao.id),
    [accountSnapshot.bets, votacao.id]
  );
  const currentRoundBet =
    userRoundBets.find((bet) => bet.roundId === round.roundId && (bet.status || 'aguardando') === 'aguardando') ||
    null;
  const currentRoundAnyBet =
    userRoundBets.find((bet) => bet.roundId === round.roundId) || null;
  const quotedAmount = Number(betAmount.replace(',', '.'));

  const renderedPoints = useMemo(
    () => {
      const allValues = [
        ...chartSamples.map((sample) => sample.value),
        ...(liveCurrentPrice != null ? [liveCurrentPrice] : []),
      ];

      return allValues.slice(-Math.max(round.points.length + 2, 3));
    },
    [chartSamples, liveCurrentPrice, round.points.length]
  );
  const chartPoints = useMemo(
    () => getChartPoints(chartSamples, liveCurrentPrice, chartMotionProgress, round.points.length),
    [chartMotionProgress, chartSamples, liveCurrentPrice, round.points.length]
  );
  const graphPath = useMemo(() => buildLinePath(chartPoints), [chartPoints]);
  const areaPath = useMemo(() => buildAreaPath(chartPoints), [chartPoints]);
  const latestChartPoint = useMemo(() => {
    if (chartPoints.length === 0) {
      return null;
    }

    return chartPoints[chartPoints.length - 1] ?? null;
  }, [chartPoints]);
  const chartValueLabels = useMemo(() => {
    if (renderedPoints.length === 0) {
      return [];
    }

    const maxValue = Math.max(...renderedPoints);
    const minValue = Math.min(...renderedPoints);
    const baseRange = Math.max(1, maxValue - minValue);
    const verticalPadding = baseRange * 0.18;
    const scaledMin = minValue - verticalPadding;
    const scaledMax = maxValue + verticalPadding;
    const steps = isCompactChart ? 2 : 4;
    const drawableHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

    return Array.from({ length: steps + 1 }, (_, index) => {
      const ratio = index / steps;
      const value = scaledMax - ratio * (scaledMax - scaledMin);
      const y = CHART_PADDING.top + ratio * drawableHeight;

      return {
        y,
        value: formatBitcoinPriceValue(convertChartValueToBitcoinPrice(value)),
      };
    });
  }, [isCompactChart, renderedPoints]);
  const chartTimeLabels = useMemo(() => {
    const totalWindow = Math.max(1, round.points.length - 1);
    const labelRatios = isCompactChart ? [0, 0.5, 1] : [0, 0.33, 0.66, 1];

    return labelRatios.map((ratio) => {
      const elapsedOffset = Math.round((1 - ratio) * totalWindow);
      return {
        x: CHART_PADDING.left + ratio * (CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right),
        label: formatBitcoinRoundTime(round.timeLeft + elapsedOffset),
      };
    });
  }, [isCompactChart, round.points.length, round.timeLeft]);

  const adjustedPoolSnapshot = useMemo(() => {
    return subtractBetFromPoolSnapshot(poolSnapshot, currentRoundBet);
  }, [currentRoundBet, poolSnapshot]);
  const roundConfiguredOdds = useMemo(
    () => getBitcoinRoundConfiguredOdds(round.roundId, { Sobe: options.Sobe.odd, Desce: options.Desce.odd }, DEFAULT_ODD),
    [options.Desce.odd, options.Sobe.odd, round.roundId]
  );

  const liveOdds = useMemo(
    () => calculateBitcoinDynamicOdds(adjustedPoolSnapshot, roundConfiguredOdds, DEFAULT_ODD),
    [adjustedPoolSnapshot, roundConfiguredOdds]
  );
  const estimatedPotentialReturn =
    Number.isFinite(quotedAmount) && quotedAmount > 0 && selectedDirection
      ? Math.round(quotedAmount * liveOdds[selectedDirection] * 100) / 100
      : Number.isFinite(quotedAmount) && quotedAmount > 0
        ? Math.round(quotedAmount * Math.max(liveOdds.Sobe, liveOdds.Desce) * 100) / 100
        : 0;
  const chartBetLabel = useMemo(() => {
    if (!latestChartPoint || !selectedDirection || !Number.isFinite(quotedAmount) || quotedAmount <= 0) {
      return null;
    }

    const liveReturn = Math.round(quotedAmount * liveOdds[selectedDirection] * 100) / 100;
    const label = formatCurrencyValue(liveReturn);
    const placeLeft = latestChartPoint.x < CHART_WIDTH * 0.72;
    const pillWidth = Math.max(18, label.length * 2.8 + 8);
    const pillHeight = 8.8;
    const offsetX = placeLeft ? 3.6 : -(pillWidth + 3.6);
    const offsetY = clamp(latestChartPoint.y - pillHeight - 2.8, CHART_PADDING.top + 1, CHART_HEIGHT - CHART_PADDING.bottom - pillHeight);

    return {
      label,
      x: clamp(latestChartPoint.x + offsetX, CHART_PADDING.left, CHART_WIDTH - CHART_PADDING.right - pillWidth),
      y: offsetY,
      width: pillWidth,
      height: pillHeight,
    };
  }, [latestChartPoint, liveOdds, quotedAmount, selectedDirection]);
  const chartPriceLabel = useMemo(() => {
    if (!latestChartPoint) {
      return null;
    }

    const currentPrice = displayedBitcoinPrice;
    const priceLabel = formatBitcoinPriceValue(currentPrice);
    const pillWidth = Math.max(24, priceLabel.length * 2.85 + 10);
    const pillHeight = 8.2;
    const offsetX = latestChartPoint.x < CHART_WIDTH * 0.7 ? 4.4 : -(pillWidth + 4.4);
    const offsetY = clamp(
      latestChartPoint.y - pillHeight / 2,
      CHART_PADDING.top + 7.5,
      CHART_HEIGHT - CHART_PADDING.bottom - pillHeight - 1
    );

    return {
      label: priceLabel,
      rawValue: currentPrice,
      x: clamp(
        latestChartPoint.x + offsetX,
        CHART_PADDING.left + 1,
        CHART_WIDTH - CHART_PADDING.right - pillWidth
      ),
      y: offsetY,
      width: pillWidth,
      height: pillHeight,
      guideY: latestChartPoint.y,
      guideX2: latestChartPoint.x - 1.1,
    };
  }, [displayedBitcoinPrice, latestChartPoint]);
  const roundOutcomeOverlay = useMemo(() => {
    if (!round.result) {
      return null;
    }

    if (currentRoundAnyBet?.candidato) {
      const didWin = String(currentRoundAnyBet.candidato).trim().toLowerCase() === round.result.toLowerCase();

      return {
        label: didWin ? 'Win' : 'Loss',
        detail: `Resultado: ${round.result}`,
        className: didWin
          ? 'border-emerald-400/30 bg-emerald-500/18 text-emerald-50'
          : 'border-rose-400/30 bg-rose-500/18 text-rose-50',
      };
    }

    return {
      label: round.result,
      detail: 'Rodada encerrada',
      className: 'border-cyan-400/30 bg-cyan-500/18 text-cyan-50',
    };
  }, [currentRoundAnyBet, round.result]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const syncCompactChart = () => setIsCompactChart(mediaQuery.matches);

    syncCompactChart();
    mediaQuery.addEventListener('change', syncCompactChart);

    return () => {
      mediaQuery.removeEventListener('change', syncCompactChart);
    };
  }, []);

  useEffect(() => {
    currentDirectionRef.current = currentDirection;
  }, [currentDirection]);

  useEffect(() => {
    if (currentRoundBet?.candidato === 'Sobe' || currentRoundBet?.candidato === 'Desce') {
      setSelectedDirection(currentRoundBet.candidato);
      return;
    }

    setSelectedDirection(null);
  }, [currentRoundBet]);

  useEffect(() => {
    if (round.points.length === 0) {
      setChartSamples([]);
      chartSamplesRef.current = [];
      setLiveCurrentPrice(null);
      setLiveTargetPrice(null);
      displayedBitcoinPriceRef.current = BITCOIN_PRICE_BASELINE;
      setDisplayedBitcoinPrice(BITCOIN_PRICE_BASELINE);
      liveCurrentPriceRef.current = null;
      liveTargetPriceRef.current = null;
      liveVelocityRef.current = 0;
      targetVelocityRef.current = 0;
      lastObservedPointRef.current = null;
      lastObservedRoundIdRef.current = null;
      chartMotionProgressRef.current = 0;
      setChartMotionProgress(0);
      lastFrameTimeRef.current = null;
      return;
    }

    if (lastObservedRoundIdRef.current !== round.roundId) {
      const initialCommittedSamples = round.points.slice(0, -1).map((value, index) => ({
        id: `${round.roundId}-${index}`,
        value,
      }));
      const latestValue = round.points[round.points.length - 1] ?? null;
      chartSamplesRef.current = initialCommittedSamples;
      lastObservedRoundIdRef.current = round.roundId;
      lastObservedPointRef.current = latestValue;
      liveCurrentPriceRef.current = latestValue;
      liveTargetPriceRef.current = latestValue;
      displayedBitcoinPriceRef.current =
        latestValue != null ? convertChartValueToBitcoinPrice(latestValue) : BITCOIN_PRICE_BASELINE;
      liveVelocityRef.current = currentDirectionRef.current === 'Desce' ? -0.42 : 0.42;
      targetVelocityRef.current = liveVelocityRef.current;
      chartMotionProgressRef.current = 0;
      lastFrameTimeRef.current = null;
      setChartSamples(initialCommittedSamples);
      setLiveCurrentPrice(latestValue);
      setLiveTargetPrice(latestValue);
      setDisplayedBitcoinPrice(displayedBitcoinPriceRef.current);
      setChartMotionProgress(0);
      return;
    }

    const latestRawPoint = round.points[round.points.length - 1] ?? null;
    if (latestRawPoint == null || latestRawPoint === lastObservedPointRef.current) {
      return;
    }

    const previousObservedPoint = lastObservedPointRef.current;
    lastObservedPointRef.current = latestRawPoint;
    liveTargetPriceRef.current = latestRawPoint;
    if (previousObservedPoint != null) {
      const observedVelocity = latestRawPoint - previousObservedPoint;
      targetVelocityRef.current =
        Math.abs(observedVelocity) > 0.0001
          ? observedVelocity
          : currentDirectionRef.current === 'Desce'
            ? -0.42
            : 0.42;
    }
    setLiveTargetPrice(latestRawPoint);
  }, [round.points]);

  useEffect(() => {
    if (chartAnimationFrameRef.current != null) {
      window.cancelAnimationFrame(chartAnimationFrameRef.current);
    }

    const animate = (timestamp: number) => {
      const previousTimestamp = lastFrameTimeRef.current ?? timestamp;
      const deltaMs = Math.min(64, Math.max(0, timestamp - previousTimestamp));
      lastFrameTimeRef.current = timestamp;

      const currentPrice = liveCurrentPriceRef.current;
      const targetPrice = liveTargetPriceRef.current;

      if (currentPrice != null) {
        const directionSign = currentDirectionRef.current === 'Desce' ? -1 : 1;
        const minimumVelocity = 0.42 * directionSign;
        const desiredVelocity =
          Math.abs(targetVelocityRef.current) > 0.0001 ? targetVelocityRef.current : minimumVelocity;

        liveVelocityRef.current += (desiredVelocity - liveVelocityRef.current) * 0.08;

        if (Math.abs(liveVelocityRef.current) < Math.abs(minimumVelocity)) {
          liveVelocityRef.current = minimumVelocity;
        }

        let nextPrice = currentPrice + liveVelocityRef.current * (deltaMs / 1000);

        if (targetPrice != null) {
          nextPrice += (targetPrice - nextPrice) * 0.035;
        }

        liveCurrentPriceRef.current = nextPrice;
        setLiveCurrentPrice(nextPrice);

        const nextDisplayedTarget = convertChartValueToBitcoinPrice(nextPrice);
        const displayedPrice = displayedBitcoinPriceRef.current;
        const maxStep = BITCOIN_PRICE_MAX_STEP_PER_SECOND * (deltaMs / 1000);
        const rawDelta = nextDisplayedTarget - displayedPrice;
        const easedDelta = rawDelta * 0.012;
        const boundedDelta =
          Math.abs(rawDelta) <= maxStep
            ? rawDelta
            : Math.sign(rawDelta) * Math.max(Math.abs(easedDelta), maxStep * 0.45);
        const significantDelta =
          Math.abs(rawDelta) < BITCOIN_PRICE_MIN_SIGNIFICANT_STEP
            ? 0
            : Math.sign(boundedDelta) *
              Math.max(Math.abs(boundedDelta), BITCOIN_PRICE_MIN_SIGNIFICANT_STEP * (deltaMs / 1000));
        const nextDisplayedPrice =
          Math.abs(rawDelta) < BITCOIN_PRICE_MIN_SIGNIFICANT_STEP
            ? displayedPrice
            : displayedPrice + significantDelta;

        displayedBitcoinPriceRef.current = nextDisplayedPrice;
        setDisplayedBitcoinPrice(nextDisplayedPrice);
      }

      const nextProgress = chartMotionProgressRef.current + deltaMs / 1000;
      if (nextProgress >= 1 && liveCurrentPriceRef.current != null) {
        const committedValue = liveCurrentPriceRef.current;
        const nextSamples = [
          ...chartSamplesRef.current,
          {
            id: `${round.roundId}-${timestamp}`,
            value: committedValue,
          },
        ].slice(-240);
        chartSamplesRef.current = nextSamples;
        setChartSamples(nextSamples);
        chartMotionProgressRef.current = nextProgress - 1;
      } else {
        chartMotionProgressRef.current = nextProgress;
      }

      setChartMotionProgress(chartMotionProgressRef.current);
      chartAnimationFrameRef.current = window.requestAnimationFrame(animate);
    };

    chartAnimationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (chartAnimationFrameRef.current != null) {
        window.cancelAnimationFrame(chartAnimationFrameRef.current);
        chartAnimationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
    };
  }, [round.points.length, round.roundId]);

  useEffect(() => {
    const loadPoolSnapshot = async () => {
      try {
        const response = await fetch(
          `/api/votacoes/bitcoin-pools?votacaoId=${encodeURIComponent(votacao.id)}&roundId=${encodeURIComponent(round.roundId)}`,
          { method: 'GET', cache: 'no-store' }
        );

        const payload = (await response.json()) as {
          sides?: {
            sobe?: BitcoinPoolSide;
            desce?: BitcoinPoolSide;
          };
        };

        if (!response.ok || !payload.sides) {
          setPoolSnapshot(createEmptyPoolSnapshot());
          return;
        }

        setPoolSnapshot({
          sides: {
            Sobe: {
              amount: Number(payload.sides.sobe?.amount || 0),
              potentialReturn: Number(payload.sides.sobe?.potentialReturn || 0),
              bets: Number(payload.sides.sobe?.bets || 0),
            },
            Desce: {
              amount: Number(payload.sides.desce?.amount || 0),
              potentialReturn: Number(payload.sides.desce?.potentialReturn || 0),
              bets: Number(payload.sides.desce?.bets || 0),
            },
          },
        });
      } catch {
        setPoolSnapshot(createEmptyPoolSnapshot());
      }
    };

    void loadPoolSnapshot();
    const intervalId = window.setInterval(() => {
      void loadPoolSnapshot();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [round.roundId, votacao.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(getResultHistoryStorageKey(votacao.id));
      if (!storedValue) {
        setResultHistory([]);
        return;
      }

      const parsed = JSON.parse(storedValue) as BitcoinResultHistoryItem[];
      setResultHistory(
        Array.isArray(parsed)
          ? parsed.filter(
              (item) =>
                item &&
                typeof item.roundId === 'string' &&
                (item.result === 'Sobe' || item.result === 'Desce') &&
                typeof item.settledAt === 'string'
            )
          : []
      );
    } catch {
      setResultHistory([]);
    }
  }, [votacao.id]);

  useEffect(() => {
    if (!round.result || typeof window === 'undefined') {
      return;
    }

    const settledResult = round.result;

    setResultHistory((current) => {
      if (current.some((item) => item.roundId === round.roundId)) {
        return current;
      }

      const nextHistory = [
        {
          roundId: round.roundId,
          result: settledResult,
          settledAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 10);

      window.localStorage.setItem(getResultHistoryStorageKey(votacao.id), JSON.stringify(nextHistory));
      return nextHistory;
    });
  }, [round.result, round.roundId, votacao.id]);

  useEffect(() => {
    router.prefetch('/home');
  }, [router]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setUser(session?.user ?? null);
      setAccountSnapshot(
        extractBitcoinAccountSnapshotFromMetadata(
          (session?.user?.user_metadata || {}) as Record<string, unknown>
        )
      );
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAccountSnapshot(
        extractBitcoinAccountSnapshotFromMetadata(
          (session?.user?.user_metadata || {}) as Record<string, unknown>
        )
      );
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const authorizedJsonRequest = async <T,>(
    sessionToken: string,
    input: string,
    init?: RequestInit
  ) => {
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${sessionToken}`);

    const response = await fetch(input, {
      ...init,
      headers,
    });
    const payload = (await response.json()) as T & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error || 'Falha na solicitacao.');
    }

    return payload;
  };

  useEffect(() => {
    const settleRoundForUser = async () => {
      if (!round.result || !user || settlingRoundsRef.current.has(round.roundId)) {
        return;
      }

      if (accountSnapshot.settledRoundIds.includes(round.roundId)) {
        return;
      }

      settlingRoundsRef.current.add(round.roundId);

      try {
        const session = await requireAuthenticatedSession();
        if (!session?.access_token) {
          return;
        }

        const payload = await authorizedJsonRequest<{
          account: BitcoinAccountSnapshot;
          settled: boolean;
        }>(session.access_token, '/api/votacoes/bitcoin-settle', {
          method: 'POST',
          body: JSON.stringify({
            votacaoId: votacao.id,
            roundId: round.roundId,
          }),
        });

        setAccountSnapshot(payload.account);
      } catch (error) {
        console.error('Erro ao liquidar rodada Bitcoin:', error);
      } finally {
        window.setTimeout(() => {
          settlingRoundsRef.current.delete(round.roundId);
        }, 1500);
      }
    };

    void settleRoundForUser();
  }, [accountSnapshot.settledRoundIds, round.result, round.roundId, user, votacao.id]);

  useEffect(() => {
    if (!isBettingOpen && round.status === 'running' && round.timeLeft === BETTING_CLOSES_AT_SECONDS) {
      setBetMessage('Apostas encerradas. Aguardando resultado...');
    }
  }, [isBettingOpen, round.status, round.timeLeft]);

  useEffect(() => {
    if (round.status === 'cooldown') {
      setSelectedDirection(null);
      setBetAmount('');
    }
  }, [round.status, round.roundId]);

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

    setAccountSnapshot(
      extractBitcoinAccountSnapshotFromMetadata(
        (session.user.user_metadata || {}) as Record<string, unknown>
      )
    );

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

    setPlacingBet(direction);
    setBetMessage(null);

    try {
      const payload = await authorizedJsonRequest<{
        account: BitcoinAccountSnapshot;
        bet: BitcoinBetItem;
        message: string;
        pool: BitcoinPoolSnapshot;
      }>(session.access_token, '/api/votacoes/bitcoin-bet', {
        method: 'POST',
        body: JSON.stringify({
          votacaoId: votacao.id,
          direction,
          amount,
        }),
      });

      setAccountSnapshot(payload.account);
      setPoolSnapshot(payload.pool);

      setSelectedDirection(null);
      setBetAmount('');
      setBetMessage(payload.message);
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

  const resultLabel =
    round.result != null
      ? 'Rodada encerrada'
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
              </div>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-white lg:text-4xl">
                {votacao.titulo}
              </h1>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-[#0b1220] p-3.5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.9)] sm:rounded-[30px] sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80 sm:text-[11px] sm:tracking-[0.3em]">
                      Gráfico da rodada
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-[13px] font-medium text-slate-200 sm:text-[15px]">
                      <span className="text-slate-400">Direção atual</span>
                      <span
                        className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold sm:text-sm ${
                          currentDirection === 'Sobe'
                            ? 'bg-emerald-500/14 text-emerald-300'
                            : 'bg-rose-500/14 text-rose-300'
                        }`}
                        aria-label={currentDirection === 'Sobe' ? 'Positivo' : 'Negativo'}
                        title={currentDirection === 'Sobe' ? 'Positivo' : 'Negativo'}
                      >
                        {currentDirection === 'Sobe' ? '▲' : '▼'}
                      </span>
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:text-xs sm:tracking-[0.24em]">
                      Tempo restante
                    </p>
                    <p className="mt-1 text-xl font-black tabular-nums text-white sm:mt-2 sm:text-2xl">{formatBitcoinRoundTime(round.timeLeft)}</p>
                  </div>
                </div>

                <div className="relative mt-4 overflow-hidden rounded-[20px] border border-emerald-300/10 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),transparent_24%),linear-gradient(180deg,#06110d_0%,#08110f_35%,#05080d_100%)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_20px_45px_-30px_rgba(16,185,129,0.4)] sm:mt-5 sm:rounded-[26px] sm:p-4">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(148,163,184,0.03)_0%,rgba(15,23,42,0)_18%,rgba(15,23,42,0.2)_100%)]" />
                  {roundOutcomeOverlay && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
                      <div
                        className={`min-w-[150px] rounded-[20px] border px-4 py-4 text-center shadow-[0_24px_80px_-35px_rgba(15,23,42,0.85)] backdrop-blur-md sm:min-w-[180px] sm:rounded-[24px] sm:px-6 sm:py-5 ${roundOutcomeOverlay.className}`}
                      >
                        <p className="text-2xl font-black uppercase tracking-[0.12em] sm:text-4xl">
                          {roundOutcomeOverlay.label}
                        </p>
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80 sm:text-xs sm:tracking-[0.2em]">
                          {roundOutcomeOverlay.detail}
                        </p>
                      </div>
                    </div>
                  )}
                  <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    className="relative z-[1] block h-auto w-full aspect-[1.28/1] sm:aspect-[1.7/1]"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <linearGradient id="bitcoin-chart-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={isChartFalling ? '#ff9a9a' : '#61f0a8'} />
                        <stop offset="60%" stopColor={chartLineColor} />
                        <stop offset="100%" stopColor={isChartFalling ? '#ffd0d0' : '#b8ffd4'} />
                      </linearGradient>
                      <linearGradient id="bitcoin-chart-area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={chartAreaStartColor} stopOpacity="0.34" />
                        <stop offset="55%" stopColor={chartAreaMidColor} stopOpacity="0.14" />
                        <stop offset="100%" stopColor={chartAreaBaseColor} stopOpacity="0.02" />
                      </linearGradient>
                      <filter id="bitcoin-chart-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="1.1" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <filter id="bitcoin-chart-point-glow" x="-300%" y="-300%" width="600%" height="600%">
                        <feGaussianBlur stdDeviation="1.8" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {chartValueLabels.map((label, index) => (
                      <g key={`bitcoin-grid-row-${index}`}>
                        <line
                          x1={CHART_PADDING.left}
                          x2={CHART_WIDTH - CHART_PADDING.right}
                          y1={label.y}
                          y2={label.y}
                          stroke="rgba(148,163,184,0.12)"
                          strokeWidth="0.32"
                          strokeDasharray="1.4 1.8"
                        />
                        <text
                          x={CHART_WIDTH - 1.2}
                          y={label.y + 1}
                          textAnchor="end"
                          fontSize="3.1"
                          fill="rgba(191,219,254,0.56)"
                        >
                          {label.value}
                        </text>
                      </g>
                    ))}

                    {chartTimeLabels.map((label, index) => (
                      <text
                        key={`bitcoin-time-label-${index}`}
                        x={label.x}
                        y={CHART_HEIGHT - 2}
                        textAnchor={index === 0 ? 'start' : index === chartTimeLabels.length - 1 ? 'end' : 'middle'}
                        fontSize="3"
                        fill="rgba(191,219,254,0.48)"
                      >
                        {label.label}
                      </text>
                    ))}

                    {areaPath ? <path d={areaPath} fill="url(#bitcoin-chart-area-gradient)" /> : null}

                    {chartPriceLabel ? (
                      <line
                        x1={CHART_PADDING.left}
                        x2={chartPriceLabel.guideX2}
                        y1={chartPriceLabel.guideY}
                        y2={chartPriceLabel.guideY}
                        stroke="rgba(240, 171, 252, 0.34)"
                        strokeWidth="0.34"
                        strokeDasharray="1.5 1.8"
                      />
                    ) : null}

                    {graphPath ? (
                      <>
                        <path
                          d={graphPath}
                          fill="none"
                          stroke={chartGlowStroke}
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          filter="url(#bitcoin-chart-glow)"
                        />
                        <path
                          d={graphPath}
                          fill="none"
                          stroke="url(#bitcoin-chart-line-gradient)"
                          strokeWidth="0.72"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    ) : null}

                    {chartBetLabel ? (
                      <g className="pointer-events-none">
                        <rect
                          x={chartBetLabel.x}
                          y={chartBetLabel.y}
                          rx="4.4"
                          ry="4.4"
                          width={chartBetLabel.width}
                          height={chartBetLabel.height}
                          fill="rgba(6, 182, 212, 0.18)"
                          stroke="rgba(103, 232, 249, 0.42)"
                          strokeWidth="0.34"
                        />
                        <text
                          x={chartBetLabel.x + chartBetLabel.width / 2}
                          y={chartBetLabel.y + chartBetLabel.height / 2 + 1.1}
                          textAnchor="middle"
                          fontSize="3.1"
                          fontWeight="700"
                          fill="rgba(236, 254, 255, 0.96)"
                        >
                          {chartBetLabel.label}
                        </text>
                      </g>
                    ) : null}

                    {chartPriceLabel ? (
                      <g className="pointer-events-none">
                        <rect
                          x={chartPriceLabel.x}
                          y={chartPriceLabel.y}
                          rx="5"
                          ry="5"
                          width={chartPriceLabel.width}
                          height={chartPriceLabel.height}
                          fill="rgba(2, 6, 23, 0.92)"
                          stroke={isChartFalling ? 'rgba(248, 113, 113, 0.42)' : 'rgba(74, 222, 128, 0.42)'}
                          strokeWidth="0.36"
                        />
                        <text
                          x={chartPriceLabel.x + 4}
                          y={chartPriceLabel.y + 5.05}
                          fontSize="3.05"
                          fontWeight="700"
                          fill={isChartFalling ? '#fecaca' : '#dcfce7'}
                        >
                          {chartPriceLabel.label}
                        </text>
                      </g>
                    ) : null}

                    {latestChartPoint ? (
                      <g filter="url(#bitcoin-chart-point-glow)">
                        <circle
                          cx={latestChartPoint.x}
                          cy={latestChartPoint.y}
                          r="2.6"
                          fill={chartPointHalo}
                        />
                        <circle
                          cx={latestChartPoint.x}
                          cy={latestChartPoint.y}
                          r="1.15"
                          fill={chartGlowColor}
                          stroke="#ecfff4"
                          strokeWidth="0.36"
                        />
                      </g>
                    ) : null}
                  </svg>
                </div>
              </div>

              <div className="mt-5 grid gap-2.5 sm:mt-6 sm:grid-cols-2 sm:gap-3">
                {(['Sobe', 'Desce'] as BitcoinDirection[]).map((direction) => {
                  const liveOdd = liveOdds[direction];
                  const isSelected = selectedDirection === direction;
                  const isBusy = placingBet === direction;

                  return (
                    <button
                      key={direction}
                      type="button"
                      onClick={() => {
                        if (!isBettingOpen || isBusy) {
                          return;
                        }

                        setSelectedDirection(direction);
                        setBetMessage(null);
                      }}
                      disabled={!isBettingOpen || isBusy}
                      className={`rounded-[20px] border px-3.5 py-3.5 text-left transition sm:rounded-[24px] sm:px-4 sm:py-4 ${
                        direction === 'Sobe'
                          ? 'border-emerald-400/20 bg-emerald-500/10 hover:bg-emerald-500/15'
                          : 'border-rose-400/20 bg-rose-500/10 hover:bg-rose-500/15'
                      } ${isSelected ? 'ring-2 ring-cyan-300/60' : ''} disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[15px] font-semibold text-white sm:text-base">{direction}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[13px] font-bold text-white sm:px-3 sm:text-sm">
                          {liveOdd.toFixed(2)}x
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedDirection && (
                <div className="mt-5 rounded-[20px] border border-cyan-400/20 bg-[#0f172a] p-3.5 shadow-[0_18px_40px_-28px_rgba(6,182,212,0.35)] sm:rounded-[24px] sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div>
                      <label className="text-sm font-semibold text-white">Valor da aposta</label>
                      <p className="mt-1 text-[11px] text-zinc-500 sm:text-xs">
                        Escolha selecionada: {selectedDirection} com odd {liveOdds[selectedDirection].toFixed(2)}x
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-cyan-500/12 px-3 py-1 text-sm font-bold text-cyan-200">
                      {liveOdds[selectedDirection].toFixed(2)}x
                    </span>
                  </div>
                  <div className="mt-3 flex items-center rounded-[16px] border border-white/10 bg-black/20 px-3.5 py-3 sm:rounded-[18px] sm:px-4">
                    <span className="text-sm font-bold text-cyan-300 sm:text-base">R$</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={betAmount}
                      onChange={(event) => setBetAmount(event.target.value)}
                      placeholder="Ex: 50"
                      disabled={!isBettingOpen || placingBet !== null}
                      className="w-full border-0 bg-transparent px-2.5 text-[15px] font-semibold text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:text-slate-500 sm:px-3 sm:text-lg"
                    />
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-[11px] leading-4 text-zinc-500 sm:text-xs">
                      Retorno estimado:{' '}
                      <span className="font-semibold text-zinc-200">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(estimatedPotentialReturn)}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void placeBitcoinBet(selectedDirection)}
                      disabled={!isBettingOpen || placingBet !== null}
                      className="w-full rounded-full bg-[linear-gradient(135deg,#0891b2,#0f766e)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {placingBet === selectedDirection ? 'Confirmando...' : 'Confirmar aposta'}
                    </button>
                  </div>
                </div>
              )}

              {betMessage && (
                <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                  {betMessage}
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-white/10 bg-[#0f131a] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Resultados anteriores</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Histórico das últimas rodadas</h2>
              <div className="mt-4 space-y-3">
                {resultHistory.length > 0 ? (
                  resultHistory.map((item, index) => (
                    <div
                      key={`${item.roundId}-${index}`}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-semibold text-white">Rodada #{resultHistory.length - index}</p>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.result === 'Sobe'
                              ? 'bg-emerald-500/15 text-emerald-200'
                              : 'bg-rose-500/15 text-rose-200'
                          }`}
                        >
                          {item.result}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs text-zinc-500">
                          Encerrada em {new Date(item.settledAt).toLocaleString('pt-BR')}
                        </span>
                        <span className="text-xs font-semibold text-zinc-300">Resultado confirmado</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-zinc-400">
                    Os resultados anteriores das rodadas Bitcoin vão aparecer aqui assim que a primeira rodada for encerrada.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}



