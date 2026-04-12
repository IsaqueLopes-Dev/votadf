import { NextResponse } from 'next/server';
import {
  ensureAdminRequest,
  getUserDisplayName,
  listAllAuthUsers,
  toNumber,
} from '../utils';

type BetStatus = 'aguardando' | 'ganhou' | 'perdeu';

const parseStatus = (value: unknown): BetStatus => {
  if (value === 'ganhou' || value === 'perdeu') {
    return value;
  }

  return 'aguardando';
};

export async function GET(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  try {
    const users = await listAllAuthUsers(supabaseAdmin);

    const bets = users
      .flatMap((user) => {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const displayName = getUserDisplayName(metadata, user.email);
        const currentBalance = toNumber(metadata.balance ?? metadata.saldo);
        const rawBets = Array.isArray(metadata.bets) ? metadata.bets : [];

        return rawBets
          .map((bet) => {
            const betData = (bet || {}) as Record<string, unknown>;

            return {
              id: String(betData.id || ''),
              userId: user.id,
              userEmail: user.email || '',
              userDisplayName: displayName,
              userBalance: currentBalance,
              votacaoId: String(betData.votacaoId || ''),
              votacaoTitulo: String(betData.votacaoTitulo || ''),
              candidato: String(betData.candidato || ''),
              odd: toNumber(betData.odd),
              amount: toNumber(betData.amount),
              potentialReturn: toNumber(betData.potentialReturn),
              payoutAmount: toNumber(betData.payoutAmount),
              createdAt: String(betData.createdAt || ''),
              status: parseStatus(betData.status),
              settledAt: String(betData.settledAt || ''),
              settledByEmail: String(betData.settledByEmail || ''),
            };
          })
          .filter((bet) => bet.id && bet.votacaoId && bet.candidato && bet.amount > 0);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totals = bets.reduce(
      (acc, bet) => {
        acc.totalBets += 1;
        acc.totalStaked += bet.amount;

        if (bet.status === 'aguardando') {
          acc.pending += 1;
        }

        if (bet.status === 'ganhou') {
          acc.won += 1;
          acc.totalPotentialPayout += bet.potentialReturn;
          acc.totalWonValue += bet.payoutAmount > 0 ? bet.payoutAmount : bet.potentialReturn;
        }

        if (bet.status === 'perdeu') {
          acc.lost += 1;
          acc.totalLostValue += bet.amount;
        }

        return acc;
      },
      {
        totalBets: 0,
        pending: 0,
        won: 0,
        lost: 0,
        totalStaked: 0,
        totalPotentialPayout: 0,
        totalWonValue: 0,
        totalLostValue: 0,
      }
    );

    return NextResponse.json({
      bets,
      totals: {
        ...totals,
        totalStaked: Math.round(totals.totalStaked * 100) / 100,
        totalPotentialPayout: Math.round(totals.totalPotentialPayout * 100) / 100,
        totalWonValue: Math.round(totals.totalWonValue * 100) / 100,
        totalLostValue: Math.round(totals.totalLostValue * 100) / 100,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar apostas.' },
      { status: 500 }
    );
  }
}
