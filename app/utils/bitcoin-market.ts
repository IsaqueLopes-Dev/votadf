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
export const HOUSE_MARGIN = 0.12;
export const HOUSE_LIQUIDITY = 300;

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

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
