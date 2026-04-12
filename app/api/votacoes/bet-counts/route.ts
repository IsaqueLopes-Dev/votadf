import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AuthUser = {
  user_metadata?: Record<string, unknown>;
};

type CountsMap = Record<string, Record<string, number>>;

const normalizeCandidate = (value: string) => value.trim().toLowerCase();

const listAllAuthUsers = async (supabaseAdmin: ReturnType<typeof createClient>) => {
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

export const dynamic = 'force-dynamic';
export const revalidate = 5;

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json(
        { counts: {} },
        { headers: { 'Cache-Control': 'public, max-age=5, s-maxage=5, stale-while-revalidate=10' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRole);
    const users = await listAllAuthUsers(supabaseAdmin);

    const counts: CountsMap = {};

    for (const user of users) {
      const metadata = (user.user_metadata || {}) as Record<string, unknown>;
      const rawBets = Array.isArray(metadata.bets) ? metadata.bets : [];

      for (const item of rawBets) {
        const bet = (item || {}) as Record<string, unknown>;
        const votacaoId = String(bet.votacaoId || '').trim();
        const candidato = normalizeCandidate(String(bet.candidato || ''));

        if (!votacaoId || !candidato) continue;

        if (!counts[votacaoId]) {
          counts[votacaoId] = {};
        }

        counts[votacaoId][candidato] = (counts[votacaoId][candidato] || 0) + 1;
      }
    }

    return NextResponse.json(
      { counts },
      { headers: { 'Cache-Control': 'public, max-age=5, s-maxage=5, stale-while-revalidate=10' } }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erro ao buscar contagem de apostas.',
        counts: {},
      },
      { status: 500, headers: { 'Cache-Control': 'public, max-age=5, s-maxage=5, stale-while-revalidate=10' } }
    );
  }
}
