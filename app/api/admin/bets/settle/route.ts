import { NextResponse } from 'next/server';
import { ensureAdminRequest, toNumber } from '../../utils';

type SettleStatus = 'ganhou' | 'perdeu';

const isSettleStatus = (value: unknown): value is SettleStatus => {
  return value === 'ganhou' || value === 'perdeu';
};

export async function POST(request: Request) {
  const { user, supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin || !user) {
    return errorResponse;
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const userId = String(payload.userId || '').trim();
  const betId = String(payload.betId || '').trim();
  const status = payload.status;

  if (!userId || !betId || !isSettleStatus(status)) {
    return NextResponse.json(
      { error: 'Informe userId, betId e status (ganhou/perdeu).' },
      { status: 400 }
    );
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (userError || !userData?.user) {
    return NextResponse.json({ error: userError?.message || 'Usuário não encontrado.' }, { status: 404 });
  }

  const targetUser = userData.user;
  const metadata = ((targetUser.user_metadata || {}) as Record<string, unknown>) || {};
  const rawBets = Array.isArray(metadata.bets) ? metadata.bets : [];
  const betIndex = rawBets.findIndex((item) => {
    const bet = (item || {}) as Record<string, unknown>;
    return String(bet.id || '') === betId;
  });

  if (betIndex === -1) {
    return NextResponse.json({ error: 'Aposta não encontrada.' }, { status: 404 });
  }

  const currentBet = ((rawBets[betIndex] || {}) as Record<string, unknown>) || {};
  const currentStatus = String(currentBet.status || 'aguardando');

  if (currentStatus === 'ganhou' || currentStatus === 'perdeu') {
    return NextResponse.json(
      { error: 'Essa aposta já foi liquidada e não pode ser alterada.' },
      { status: 409 }
    );
  }

  const currentBalance = toNumber(metadata.balance ?? metadata.saldo);
  const potentialReturn = toNumber(currentBet.potentialReturn);
  const payoutAmount = status === 'ganhou' ? potentialReturn : 0;
  const nextBalance = Math.round((currentBalance + payoutAmount) * 100) / 100;

  const nextBet = {
    ...currentBet,
    status,
    settledAt: new Date().toISOString(),
    settledBy: user.id,
    settledByEmail: user.email || '',
    payoutApplied: status === 'ganhou',
    payoutAmount,
  };

  const nextBets = rawBets.slice();
  nextBets[betIndex] = nextBet;

  const { data: updatedUserData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      balance: nextBalance,
      bets: nextBets,
    },
  });

  if (updateError || !updatedUserData.user) {
    return NextResponse.json(
      { error: updateError?.message || 'Não foi possível liquidar a aposta.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message:
      status === 'ganhou'
        ? 'Aposta marcada como ganhou e saldo creditado.'
        : 'Aposta marcada como perdeu.',
    bet: nextBet,
    user: {
      id: updatedUserData.user.id,
      email: updatedUserData.user.email || '',
      balance: nextBalance,
    },
  });
}
