import { NextResponse } from 'next/server';
import { getAuthenticatedUnifiedProfileContext } from '../../profile/utils';
import { getBitcoinRoundSnapshot } from '../../../utils/bitcoin-round';
import {
  extractBitcoinAccountSnapshotFromMetadata,
  type BitcoinBetItem,
} from '../../../utils/bitcoin-market';
import { parsePollMetadata } from '../../../utils/voting-market';

type VotingRow = {
  id: string;
  descricao: string | null;
  created_at: string;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let payload: { votacaoId?: unknown; roundId?: unknown };
  try {
    payload = (await request.json()) as { votacaoId?: unknown; roundId?: unknown };
  } catch {
    return NextResponse.json({ error: 'Payload invalido.' }, { status: 400 });
  }

  const votacaoId = String(payload.votacaoId || '').trim();
  const requestedRoundId = String(payload.roundId || '').trim();

  if (!votacaoId) {
    return NextResponse.json({ error: 'Informe o mercado Bitcoin.' }, { status: 400 });
  }

  const context = await getAuthenticatedUnifiedProfileContext(request);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { user, adminSupabase } = context;
  const { data: votacao, error: votingError } = await adminSupabase
    .from('votacoes')
    .select('id, descricao, created_at')
    .eq('id', votacaoId)
    .maybeSingle();

  if (votingError || !votacao) {
    return NextResponse.json({ error: votingError?.message || 'Votacao nao encontrada.' }, { status: 404 });
  }

  const voting = votacao as VotingRow;
  const metadata = parsePollMetadata(voting.descricao);

  if (metadata.tipo !== 'bitcoin-direcao') {
    return NextResponse.json({ error: 'Este mercado nao usa liquidacao Bitcoin.' }, { status: 400 });
  }

  const round = getBitcoinRoundSnapshot(voting.id, voting.created_at, Date.now());

  if (!round.result) {
    return NextResponse.json({ error: 'Rodada ainda em andamento.' }, { status: 400 });
  }
  const finalResult = round.result;

  if (requestedRoundId && requestedRoundId !== round.roundId) {
    return NextResponse.json({ error: 'Rodada informada nao corresponde a rodada atual.' }, { status: 409 });
  }

  const currentMetadata = (user.user_metadata || {}) as Record<string, unknown>;
  const account = extractBitcoinAccountSnapshotFromMetadata(currentMetadata);

  if (account.settledRoundIds.includes(round.roundId)) {
    return NextResponse.json({
      message: 'Rodada ja liquidada para este usuario.',
      result: finalResult,
      roundId: round.roundId,
      account,
      settled: false,
    });
  }

  const nextBets = [...account.bets];
  let nextBalance = account.balance;
  let settledAnyBet = false;
  let userRoundBet: BitcoinBetItem | null = null;

  nextBets.forEach((bet, index) => {
    if (
      bet.votacaoId !== voting.id ||
      String(bet.marketType || '').trim() !== 'bitcoin-direction' ||
      String(bet.roundId || '').trim() !== round.roundId ||
      String(bet.status || 'aguardando').trim() !== 'aguardando'
    ) {
      return;
    }

    const won = String(bet.candidato || '').trim().toLowerCase() === finalResult.toLowerCase();
    const payoutAmount = won ? Number(bet.potentialReturn || 0) : 0;

    nextBalance = roundCurrency(nextBalance + payoutAmount);
    nextBets[index] = {
      ...bet,
      status: won ? 'ganhou' : 'perdeu',
      result: finalResult,
      settledAt: new Date().toISOString(),
      payoutAmount,
    };
    userRoundBet = nextBets[index];
    settledAnyBet = true;
  });

  const nextSettledRoundIds = [...account.settledRoundIds, round.roundId];
  const nextMetadata = {
    ...currentMetadata,
    balance: nextBalance,
    saldo: nextBalance,
    bets: nextBets,
    bitcoin_settled_round_ids: nextSettledRoundIds,
  };
  const { data: updated, error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  });

  if (updateError || !updated.user) {
    return NextResponse.json(
      { error: updateError?.message || 'Nao foi possivel liquidar a rodada.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: settledAnyBet ? 'Rodada liquidada com sucesso.' : 'Rodada marcada como liquidada.',
    result: finalResult,
    roundId: round.roundId,
    account: extractBitcoinAccountSnapshotFromMetadata(updated.user.user_metadata || {}),
    settled: settledAnyBet,
    bet: userRoundBet,
  });
}
