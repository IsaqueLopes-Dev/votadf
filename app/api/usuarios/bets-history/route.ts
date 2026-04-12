import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const META_PREFIX = '__meta__:';

type BetItem = {
  id: string;
  votacaoId: string;
  votacaoTitulo: string;
  candidato: string;
  odd: number;
  amount: number;
  potentialReturn: number;
  createdAt: string;
  status: 'aguardando' | 'ganhou' | 'perdeu';
};

type VotingRow = {
  id: string;
  titulo: string;
  ativa: boolean;
  descricao: string | null;
};

const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
};

const normalize = (value: string) => value.trim().toLowerCase();

const parseBetStatus = (value: unknown): 'aguardando' | 'ganhou' | 'perdeu' => {
  if (value === 'ganhou' || value === 'perdeu') {
    return value;
  }

  return 'aguardando';
};

const parseWinnerFromDescricao = (descricao: string | null | undefined) => {
  const rawDescription = descricao || '';

  if (rawDescription.startsWith(META_PREFIX)) {
    const lineBreakIndex = rawDescription.indexOf('\n');
    const metaLine = lineBreakIndex === -1 ? rawDescription : rawDescription.slice(0, lineBreakIndex);

    try {
      const parsed = JSON.parse(metaLine.replace(META_PREFIX, '')) as {
        resultado?: string;
        resultadoVencedor?: string;
        winner?: string;
      };

      return String(parsed.resultadoVencedor || parsed.resultado || parsed.winner || '').trim();
    } catch {
      return '';
    }
  }

  return '';
};

export async function GET(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const {
    data: { user },
    error: userError,
  } = await anonSupabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  }

  const rawBets = Array.isArray(user.user_metadata?.bets) ? user.user_metadata.bets : [];
  const bets: BetItem[] = rawBets
    .map((bet) => ({
      id: String((bet as Record<string, unknown>).id || ''),
      votacaoId: String((bet as Record<string, unknown>).votacaoId || ''),
      votacaoTitulo: String((bet as Record<string, unknown>).votacaoTitulo || ''),
      candidato: String((bet as Record<string, unknown>).candidato || ''),
      odd: Number((bet as Record<string, unknown>).odd || 0),
      amount: Number((bet as Record<string, unknown>).amount || 0),
      potentialReturn: Number((bet as Record<string, unknown>).potentialReturn || 0),
      createdAt: String((bet as Record<string, unknown>).createdAt || ''),
      status: parseBetStatus((bet as Record<string, unknown>).status),
    }))
    .filter((bet) => bet.votacaoId && bet.candidato && Number.isFinite(bet.amount) && bet.amount > 0);

  if (!bets.length) {
    return NextResponse.json({ history: [] });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ history: [] });
  }

  const adminSupabase = createClient(supabaseUrl, serviceRole);
  const votingIds = Array.from(new Set(bets.map((bet) => bet.votacaoId)));

  const { data: votacoes, error: votacoesError } = await adminSupabase
    .from('votacoes')
    .select('id, titulo, ativa, descricao')
    .in('id', votingIds);

  if (votacoesError) {
    return NextResponse.json({ error: votacoesError.message }, { status: 500 });
  }

  const votingMap = new Map(
    ((votacoes || []) as VotingRow[]).map((votacao) => [votacao.id, votacao])
  );

  const history = bets
    .map((bet) => {
      const voting = votingMap.get(bet.votacaoId);
      const winner = parseWinnerFromDescricao(voting?.descricao);

      let status: 'aguardando' | 'ganhou' | 'perdeu' = bet.status;
      if (status === 'aguardando' && winner) {
        status = normalize(winner) === normalize(bet.candidato) ? 'ganhou' : 'perdeu';
      }

      return {
        ...bet,
        votacaoTitulo: voting?.titulo || bet.votacaoTitulo,
        ativa: voting?.ativa ?? false,
        winner,
        status,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ history });
}
