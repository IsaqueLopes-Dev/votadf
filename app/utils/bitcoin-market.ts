import type { BitcoinDirection } from './bitcoin-round';

export type BitcoinBetStatus = 'aguardando' | 'ganhou' | 'perdeu';

export type BitcoinBetItem = {
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
  status?: BitcoinBetStatus;
  result?: string;
  settledAt?: string;
  payoutAmount?: number;
};

export type BitcoinPoolSide = {
  amount: number;
  potentialReturn: number;
  bets: number;
};

export type BitcoinPoolSnapshot = {
  sides: {
    Sobe: BitcoinPoolSide;
    Desce: BitcoinPoolSide;
  };
};

export type BitcoinAccountSnapshot = {
  balance: number;
  bets: BitcoinBetItem[];
  settledRoundIds: string[];
};

export const MIN_ODD = 1.08;
export const HOUSE_MARGIN = 0.18;
export const HOUSE_LIQUIDITY = 450;
const ROUND_ODD_MIN = 1.24;
const ROUND_ODD_MAX = 1.82;
const ROUND_SIDE_SPREAD_MIN = 0.08;
const ROUND_SIDE_SPREAD_MAX = 0.24;
const LIVE_ODD_MIN_SPREAD = 0.04;

const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const roundOdd = (value: number) => Math.round(value * 100) / 100;

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

export const createEmptyPoolSnapshot = (): BitcoinPoolSnapshot => ({
  sides: {
    Sobe: { amount: 0, potentialReturn: 0, bets: 0 },
    Desce: { amount: 0, potentialReturn: 0, bets: 0 },
  },
});

export const extractBitcoinAccountSnapshotFromMetadata = (
  metadata: Record<string, unknown> | null | undefined
): BitcoinAccountSnapshot => {
  const record = metadata || {};
  const rawBets = Array.isArray(record.bets) ? record.bets : [];
  const rawSettledRounds = Array.isArray(record.bitcoin_settled_round_ids)
    ? record.bitcoin_settled_round_ids
    : [];
  const balance = Number(record.balance ?? record.saldo ?? 0);

  return {
    balance: Number.isFinite(balance) ? balance : 0,
    bets: rawBets
      .map((item) => item as BitcoinBetItem)
      .filter((bet) => bet && typeof bet === 'object' && String(bet.votacaoId || '').trim()),
    settledRoundIds: rawSettledRounds.map((item) => String(item)).filter(Boolean),
  };
};

export const subtractBetFromPoolSnapshot = (
  snapshot: BitcoinPoolSnapshot,
  bet: BitcoinBetItem | null
): BitcoinPoolSnapshot => {
  if (!bet) {
    return {
      sides: {
        Sobe: { ...snapshot.sides.Sobe },
        Desce: { ...snapshot.sides.Desce },
      },
    };
  }

  const nextSnapshot: BitcoinPoolSnapshot = {
    sides: {
      Sobe: { ...snapshot.sides.Sobe },
      Desce: { ...snapshot.sides.Desce },
    },
  };
  const side = bet.candidato === 'Sobe' ? nextSnapshot.sides.Sobe : nextSnapshot.sides.Desce;

  side.amount = Math.max(0, roundCurrency(side.amount - (Number(bet.amount) || 0)));
  side.potentialReturn = Math.max(
    0,
    roundCurrency(side.potentialReturn - (Number(bet.potentialReturn) || 0))
  );
  side.bets = Math.max(0, side.bets - 1);

  return nextSnapshot;
};

export const getBitcoinRoundConfiguredOdds = (
  roundId: string,
  configuredOdds: { Sobe: number; Desce: number },
  defaultOdd: number
) => {
  const random = createSeededRandom(`bitcoin-odds:${roundId}`);
  const houseBaseOdd = ROUND_ODD_MIN + random() * (ROUND_ODD_MAX - ROUND_ODD_MIN);
  const sideSpread = ROUND_SIDE_SPREAD_MIN + random() * (ROUND_SIDE_SPREAD_MAX - ROUND_SIDE_SPREAD_MIN);
  const favoredSide: BitcoinDirection = random() >= 0.5 ? 'Sobe' : 'Desce';
  const underdogSide: BitcoinDirection = favoredSide === 'Sobe' ? 'Desce' : 'Sobe';
  const configuredCap = {
    Sobe: Math.max(MIN_ODD, configuredOdds.Sobe || defaultOdd, defaultOdd),
    Desce: Math.max(MIN_ODD, configuredOdds.Desce || defaultOdd, defaultOdd),
  };
  const nextOdds = {
    Sobe: roundOdd(houseBaseOdd),
    Desce: roundOdd(houseBaseOdd),
  };

  nextOdds[favoredSide] = roundOdd(Math.max(MIN_ODD, houseBaseOdd - sideSpread / 2));
  nextOdds[underdogSide] = roundOdd(Math.max(MIN_ODD, houseBaseOdd + sideSpread / 2));

  return {
    Sobe: Math.min(nextOdds.Sobe, configuredCap.Sobe),
    Desce: Math.min(nextOdds.Desce, configuredCap.Desce),
  };
};

export const calculateBitcoinDynamicOdds = (
  snapshot: BitcoinPoolSnapshot,
  configuredOdds: { Sobe: number; Desce: number },
  defaultOdd: number
) => {
  const rawOdds = {
    Sobe: calculateBitcoinDynamicOdd(snapshot, 'Sobe', configuredOdds.Sobe, defaultOdd),
    Desce: calculateBitcoinDynamicOdd(snapshot, 'Desce', configuredOdds.Desce, defaultOdd),
  };

  if (Math.abs(rawOdds.Sobe - rawOdds.Desce) >= LIVE_ODD_MIN_SPREAD) {
    return rawOdds;
  }

  const favoredDirection = configuredOdds.Sobe <= configuredOdds.Desce ? 'Sobe' : 'Desce';
  const underdogDirection = favoredDirection === 'Sobe' ? 'Desce' : 'Sobe';
  const midpoint = (rawOdds.Sobe + rawOdds.Desce) / 2;
  const favoredTarget = Math.max(MIN_ODD, midpoint - LIVE_ODD_MIN_SPREAD / 2);
  const underdogTarget = midpoint + LIVE_ODD_MIN_SPREAD / 2;

  return {
    [favoredDirection]: Number(
      Math.min(favoredTarget, Math.max(MIN_ODD, configuredOdds[favoredDirection], defaultOdd)).toFixed(2)
    ),
    [underdogDirection]: Number(
      Math.min(underdogTarget, Math.max(MIN_ODD, configuredOdds[underdogDirection], defaultOdd)).toFixed(2)
    ),
  } as { Sobe: number; Desce: number };
};

export const calculateBitcoinDynamicOdd = (
  snapshot: BitcoinPoolSnapshot,
  direction: BitcoinDirection,
  configuredOdd: number,
  defaultOdd: number
) => {
  const sidePool = snapshot.sides[direction].amount + HOUSE_LIQUIDITY;
  const oppositeDirection = direction === 'Sobe' ? 'Desce' : 'Sobe';
  const oppositePool = snapshot.sides[oppositeDirection].amount + HOUSE_LIQUIDITY;
  const totalPool = sidePool + oppositePool;
  const rawOdd = (totalPool * (1 - HOUSE_MARGIN)) / Math.max(1, sidePool);

  return Number(
    Math.min(Math.max(rawOdd, MIN_ODD), Math.max(configuredOdd, defaultOdd)).toFixed(2)
  );
};
