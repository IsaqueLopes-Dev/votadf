export type BitcoinDirection = 'Sobe' | 'Desce';

export type BitcoinRoundSnapshot = {
  roundId: string;
  timeLeft: number;
  cooldownLeft: number;
  status: 'running' | 'cooldown';
  points: number[];
  currentDirection: BitcoinDirection;
  result: BitcoinDirection | null;
};

export const ROUND_DURATION_SECONDS = 300;
export const BETTING_CLOSES_AT_SECONDS = 60;
export const ROUND_RESET_DELAY_SECONDS = 10;
export const GRAPH_POINT_COUNT = 28;
export const DEFAULT_ODD = 1.8;

const FULL_CYCLE_SECONDS = ROUND_DURATION_SECONDS + ROUND_RESET_DELAY_SECONDS;

const clampPrice = (value: number) => Math.max(20, Number(value.toFixed(2)));

const getDeterministicHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const createSeededRandom = (seedValue: string) => {
  let seed = getDeterministicHash(seedValue) || 1;

  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const buildPriceStep = (
  previous: number,
  random: () => number,
  preferredDirection?: BitcoinDirection
) => {
  const randomDirection =
    preferredDirection || (random() >= 0.5 ? 'Sobe' : 'Desce');
  const signedDelta =
    (randomDirection === 'Sobe' ? 1 : -1) * (0.45 + random() * 2.2);
  const next = clampPrice(previous + signedDelta);

  if (next !== previous) {
    return next;
  }

  return clampPrice(previous + (randomDirection === 'Sobe' ? 0.15 : -0.15));
};

const createInitialPoints = (random: () => number) => {
  const points = [100];

  for (let index = 1; index < GRAPH_POINT_COUNT; index += 1) {
    const previous = points[index - 1];
    points.push(buildPriceStep(previous, random));
  }

  return points;
};

const getStableFallbackAnchor = (votacaoId: string) => {
  const stableOffsetSeconds = getDeterministicHash(votacaoId) % FULL_CYCLE_SECONDS;
  const stableBaseTimestamp = Date.UTC(2025, 0, 1, 0, 0, 0);
  return stableBaseTimestamp + stableOffsetSeconds * 1000;
};

const getAnchorTimestamp = (votacaoId: string, createdAt: string, nowTimestamp: number) => {
  const parsed = new Date(createdAt).getTime();

  if (Number.isFinite(parsed) && parsed <= nowTimestamp + 60_000) {
    return parsed;
  }

  return getStableFallbackAnchor(votacaoId);
};

export const formatBitcoinRoundTime = (value: number) => {
  const safeValue = Math.max(0, value);
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const getBitcoinRoundSnapshot = (
  votacaoId: string,
  createdAt: string,
  nowTimestamp = Date.now()
): BitcoinRoundSnapshot => {
  const anchorTimestamp = getAnchorTimestamp(votacaoId, createdAt, nowTimestamp);
  const elapsedSeconds = Math.max(0, Math.floor((nowTimestamp - anchorTimestamp) / 1000));
  const cycleIndex = Math.floor(elapsedSeconds / FULL_CYCLE_SECONDS);
  const cycleProgress = elapsedSeconds % FULL_CYCLE_SECONDS;
  const random = createSeededRandom(`${votacaoId}:${cycleIndex}`);
  const roundId = `btc-round-${votacaoId}-${cycleIndex}`;
  const points = createInitialPoints(random);

  let currentDirection: BitcoinDirection =
    points[points.length - 1] >= (points[points.length - 2] ?? points[points.length - 1] - 0.1)
      ? 'Sobe'
      : 'Desce';

  for (let second = 0; second < Math.min(cycleProgress, ROUND_DURATION_SECONDS); second += 1) {
    const previous = points[points.length - 1] ?? 100;
    const nextValue = buildPriceStep(previous, random);
    points.push(nextValue);

    if (points.length > GRAPH_POINT_COUNT) {
      points.shift();
    }

    currentDirection = nextValue > previous ? 'Sobe' : 'Desce';
  }

  const timeLeft = Math.max(0, ROUND_DURATION_SECONDS - Math.min(cycleProgress, ROUND_DURATION_SECONDS));

  if (cycleProgress < ROUND_DURATION_SECONDS) {
    return {
      roundId,
      timeLeft,
      cooldownLeft: ROUND_RESET_DELAY_SECONDS,
      status: 'running',
      points,
      currentDirection,
      result: null,
    };
  }

  const latestPoint = points[points.length - 1] ?? 100;
  const previousPoint = points[points.length - 2] ?? latestPoint - 0.15;
  const finalPoint =
    latestPoint === previousPoint ? buildPriceStep(previousPoint, random, currentDirection) : latestPoint;
  const finalDirection: BitcoinDirection = finalPoint > previousPoint ? 'Sobe' : 'Desce';

  if (latestPoint === previousPoint) {
    points[points.length - 1] = finalPoint;
  }

  return {
    roundId,
    timeLeft: 0,
    cooldownLeft: Math.max(0, FULL_CYCLE_SECONDS - cycleProgress),
    status: 'cooldown',
    points,
    currentDirection: finalDirection,
    result: finalDirection,
  };
};

export const isBitcoinDirectionMarket = (descricao: string | null | undefined) => {
  try {
    const raw = descricao || '';
    if (!raw.startsWith('__meta__:')) {
      return false;
    }

    const lineBreakIndex = raw.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? raw : raw.slice(0, lineBreakIndex);
    const parsed = JSON.parse(metaLine.replace('__meta__:', '')) as { tipo?: string };
    return parsed.tipo === 'bitcoin-direcao';
  } catch {
    return false;
  }
};
