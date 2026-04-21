import { NextResponse } from 'next/server';
import { getAuthenticatedUnifiedProfileContext } from '../../profile/utils';
import { DEFAULT_ODD, getBitcoinRoundSnapshot, type BitcoinDirection } from '../../../utils/bitcoin-round';
import {
  calculateBitcoinDynamicOdd,
  createEmptyPoolSnapshot,
  extractBitcoinAccountSnapshotFromMetadata,
  subtractBetFromPoolSnapshot,
  type BitcoinBetItem,
  type BitcoinPoolSnapshot,
} from '../../../utils/bitcoin-market';
import { parsePollMetadata, parsePollOption } from '../../../utils/voting-market';

type VotingRow = {
  id: string;
  titulo: string;
  descricao: string | null;
  opcoes: unknown[];
  ativa: boolean;
  created_at: string;
};

type AuthUser = {
  id: string;
  user_metadata?: Record<string, unknown>;
};

const BETTING_CLOSES_AT_SECONDS = 60;

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const listAllAuthUsers = async (supabaseAdmin: {
  auth: {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<{
        data: { users: unknown[] };
        error: { message: string } | null;
      }>;
    };
  };
}) => {
  const users: AuthUser[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data.users || []) as AuthUser[];
    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
};

const buildVotingOptions = (opcoes: unknown[]) => {
  const parsedOptions = Array.isArray(opcoes)
    ? opcoes.map((option) => parsePollOption(option)).filter((option) => option.label || option.odds)
    : [];

  const findDirectionOption = (direction: BitcoinDirection, fallbackIndex: number) => {
    const matched = parsedOptions.find((option) =>
      option.label.trim().toLowerCase().includes(direction === 'Sobe' ? 'sobe' : 'desce')
    );

    if (matched) {
      return matched;
    }

    return (
      parsedOptions[fallbackIndex] || {
        label: direction,
        imageUrl: '',
        odds: String(DEFAULT_ODD),
        oddsNao: '',
      }
    );
  };

  const sobeOption = findDirectionOption('Sobe', 0);
  const desceOption = findDirectionOption('Desce', 1);

  return {
    Sobe: Number.isFinite(Number(sobeOption.odds)) && Number(sobeOption.odds) > 0
      ? Number(sobeOption.odds)
      : DEFAULT_ODD,
    Desce: Number.isFinite(Number(desceOption.odds)) && Number(desceOption.odds) > 0
      ? Number(desceOption.odds)
      : DEFAULT_ODD,
  };
};

const buildPoolSnapshot = async (
  supabaseAdmin: {
    auth: {
      admin: {
        listUsers: (params: { page: number; perPage: number }) => Promise<{
          data: { users: unknown[] };
          error: { message: string } | null;
        }>;
      };
    };
  },
  votacaoId: string,
  roundId: string
) => {
  const users = await listAllAuthUsers(supabaseAdmin);
  const snapshot = createEmptyPoolSnapshot();

  for (const user of users) {
    const account = extractBitcoinAccountSnapshotFromMetadata(user.user_metadata || {});

    for (const bet of account.bets) {
      const marketType = String(bet.marketType || '').trim();
      const status = String(bet.status || 'aguardando').trim();
      const direction = String(bet.candidato || '').trim().toLowerCase();

      if (
        bet.votacaoId !== votacaoId ||
        String(bet.roundId || '').trim() !== roundId ||
        marketType !== 'bitcoin-direction' ||
        status !== 'aguardando'
      ) {
        continue;
      }

      const side =
        direction === 'sobe' ? snapshot.sides.Sobe : direction === 'desce' ? snapshot.sides.Desce : null;

      if (!side) {
        continue;
      }

      side.amount = roundCurrency(side.amount + (Number(bet.amount) || 0));
      side.potentialReturn = roundCurrency(side.potentialReturn + (Number(bet.potentialReturn) || 0));
      side.bets += 1;
    }
  }

  return snapshot;
};

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let payload: { votacaoId?: unknown; direction?: unknown; amount?: unknown };
  try {
    payload = (await request.json()) as { votacaoId?: unknown; direction?: unknown; amount?: unknown };
  } catch {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 });
  }

  const votacaoId = String(payload.votacaoId || '').trim();
  const direction = String(payload.direction || '').trim() as BitcoinDirection;
  const amount = Number(payload.amount);

  if (!votacaoId || (direction !== 'Sobe' && direction !== 'Desce') || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Informe votacaoId, direcao e valor validos.' }, { status: 400 });
  }

  const context = await getAuthenticatedUnifiedProfileContext(request);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { user, adminSupabase } = context;
  const { data: votacao, error: votingError } = await adminSupabase
    .from('votacoes')
    .select('id, titulo, descricao, opcoes, ativa, created_at')
    .eq('id', votacaoId)
    .maybeSingle();

  if (votingError || !votacao) {
    return NextResponse.json({ error: votingError?.message || 'Votacao nao encontrada.' }, { status: 404 });
  }

  const voting = votacao as VotingRow;
  const metadata = parsePollMetadata(voting.descricao);

  if (metadata.tipo !== 'bitcoin-direcao') {
    return NextResponse.json({ error: 'Este mercado nao aceita apostas Bitcoin.' }, { status: 400 });
  }

  if (voting.ativa === false) {
    return NextResponse.json({ error: 'Mercado encerrado.' }, { status: 400 });
  }

  const round = getBitcoinRoundSnapshot(voting.id, voting.created_at, Date.now());

  if (round.status !== 'running' || round.timeLeft <= BETTING_CLOSES_AT_SECONDS) {
    return NextResponse.json({ error: 'Apostas encerradas. Aguarde o resultado.' }, { status: 400 });
  }

  const currentMetadata = (user.user_metadata || {}) as Record<string, unknown>;
  const account = extractBitcoinAccountSnapshotFromMetadata(currentMetadata);
  const currentRoundBetIndex = account.bets.findIndex(
    (bet) =>
      bet.votacaoId === voting.id &&
      String(bet.marketType || '').trim() === 'bitcoin-direction' &&
      String(bet.roundId || '').trim() === round.roundId &&
      String(bet.status || 'aguardando').trim() === 'aguardando'
  );
  const existingRoundBet = currentRoundBetIndex >= 0 ? account.bets[currentRoundBetIndex] : null;
  const adjustedBalance = roundCurrency(account.balance + (existingRoundBet ? Number(existingRoundBet.amount || 0) : 0));

  if (amount > adjustedBalance) {
    return NextResponse.json({ error: 'Saldo insuficiente para essa aposta.' }, { status: 400 });
  }

  const configuredOdds = buildVotingOptions(voting.opcoes);
  const currentPool = await buildPoolSnapshot(adminSupabase, voting.id, round.roundId);
  const adjustedPool = subtractBetFromPoolSnapshot(currentPool, existingRoundBet);
  const acceptedOdd = calculateBitcoinDynamicOdd(adjustedPool, direction, configuredOdds[direction], DEFAULT_ODD);
  const nextBet: BitcoinBetItem = {
    id: existingRoundBet?.id || crypto.randomUUID(),
    votacaoId: voting.id,
    votacaoTitulo: voting.titulo,
    candidato: direction,
    odd: acceptedOdd,
    amount: roundCurrency(amount),
    potentialReturn: roundCurrency(amount * acceptedOdd),
    createdAt: new Date().toISOString(),
    roundId: round.roundId,
    marketType: 'bitcoin-direction',
    status: 'aguardando',
  };
  const nextBets = [...account.bets];

  if (currentRoundBetIndex >= 0) {
    nextBets[currentRoundBetIndex] = nextBet;
  } else {
    nextBets.push(nextBet);
  }

  const nextBalance = roundCurrency(adjustedBalance - amount);
  const nextMetadata = {
    ...currentMetadata,
    balance: nextBalance,
    saldo: nextBalance,
    bets: nextBets,
  };
  const { data: updated, error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  });

  if (updateError || !updated.user) {
    return NextResponse.json(
      { error: updateError?.message || 'Nao foi possivel registrar a aposta.' },
      { status: 500 }
    );
  }

  const refreshedAccount = extractBitcoinAccountSnapshotFromMetadata(updated.user.user_metadata || {});
  const nextPoolSnapshot: BitcoinPoolSnapshot = subtractBetFromPoolSnapshot(currentPool, existingRoundBet);
  const targetSide = direction === 'Sobe' ? nextPoolSnapshot.sides.Sobe : nextPoolSnapshot.sides.Desce;

  targetSide.amount = roundCurrency(targetSide.amount + nextBet.amount);
  targetSide.potentialReturn = roundCurrency(targetSide.potentialReturn + nextBet.potentialReturn);
  targetSide.bets += 1;

  return NextResponse.json({
    message:
      existingRoundBet != null
        ? `Escolha atualizada para ${direction} com odd ${acceptedOdd.toFixed(2)}x.`
        : `Aposta registrada em ${direction} com odd ${acceptedOdd.toFixed(2)}x.`,
    roundId: round.roundId,
    bet: nextBet,
    account: refreshedAccount,
    pool: nextPoolSnapshot,
  });
}
