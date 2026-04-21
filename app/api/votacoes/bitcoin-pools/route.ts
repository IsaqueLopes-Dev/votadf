import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AuthUser = {
  user_metadata?: Record<string, unknown>;
};

type PoolSideStats = {
  amount: number;
  potentialReturn: number;
  bets: number;
};

type PoolResponse = {
  votacaoId: string;
  roundId: string;
  sides: {
    sobe: PoolSideStats;
    desce: PoolSideStats;
  };
};

type AdminListUsersClient = {
  auth: {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<{
        data: { users: unknown[] };
        error: { message: string } | null;
      }>;
    };
  };
};

const createEmptySideStats = (): PoolSideStats => ({
  amount: 0,
  potentialReturn: 0,
  bets: 0,
});

const listAllAuthUsers = async (supabaseAdmin: AdminListUsersClient) => {
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

const toPositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const dynamic = 'force-dynamic';
export const revalidate = 2;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const votacaoId = String(searchParams.get('votacaoId') || '').trim();
    const roundId = String(searchParams.get('roundId') || '').trim();

    if (!votacaoId || !roundId) {
      return NextResponse.json(
        {
          error: 'votacaoId e roundId sao obrigatorios.',
          votacaoId,
          roundId,
          sides: { sobe: createEmptySideStats(), desce: createEmptySideStats() },
        },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json(
        {
          votacaoId,
          roundId,
          sides: { sobe: createEmptySideStats(), desce: createEmptySideStats() },
        } satisfies PoolResponse,
        { headers: { 'Cache-Control': 'public, max-age=2, s-maxage=2, stale-while-revalidate=5' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRole);
    const users = await listAllAuthUsers(supabaseAdmin);
    const response: PoolResponse = {
      votacaoId,
      roundId,
      sides: {
        sobe: createEmptySideStats(),
        desce: createEmptySideStats(),
      },
    };

    for (const user of users) {
      const metadata = (user.user_metadata || {}) as Record<string, unknown>;
      const rawBets = Array.isArray(metadata.bets) ? metadata.bets : [];

      for (const item of rawBets) {
        const bet = (item || {}) as Record<string, unknown>;
        const betVotingId = String(bet.votacaoId || '').trim();
        const betRoundId = String(bet.roundId || '').trim();
        const marketType = String(bet.marketType || '').trim();
        const status = String(bet.status || 'aguardando').trim();
        const candidato = String(bet.candidato || '').trim().toLowerCase();

        if (
          betVotingId !== votacaoId ||
          betRoundId !== roundId ||
          marketType !== 'bitcoin-direction' ||
          status !== 'aguardando'
        ) {
          continue;
        }

        const side =
          candidato === 'sobe' ? response.sides.sobe : candidato === 'desce' ? response.sides.desce : null;

        if (!side) {
          continue;
        }

        side.amount += toPositiveNumber(bet.amount);
        side.potentialReturn += toPositiveNumber(bet.potentialReturn);
        side.bets += 1;
      }
    }

    response.sides.sobe.amount = Math.round(response.sides.sobe.amount * 100) / 100;
    response.sides.sobe.potentialReturn = Math.round(response.sides.sobe.potentialReturn * 100) / 100;
    response.sides.desce.amount = Math.round(response.sides.desce.amount * 100) / 100;
    response.sides.desce.potentialReturn = Math.round(response.sides.desce.potentialReturn * 100) / 100;

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, max-age=2, s-maxage=2, stale-while-revalidate=5' },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erro ao calcular pools do mercado Bitcoin.',
        votacaoId: '',
        roundId: '',
        sides: { sobe: createEmptySideStats(), desce: createEmptySideStats() },
      },
      { status: 500 }
    );
  }
}
