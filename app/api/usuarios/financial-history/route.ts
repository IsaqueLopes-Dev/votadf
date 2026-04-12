import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type FinancialHistoryItem = {
  id: string;
  tipo: 'deposito' | 'saque';
  status: 'aprovado' | 'pendente' | 'recusado';
  amount: number;
  createdAt: string;
  cpf?: string;
  paymentId?: string;
};

const parseWithdrawalStatus = (value: unknown): FinancialHistoryItem['status'] => {
  const statusRaw = String(value || 'pending').toLowerCase();

  if (statusRaw === 'approved' || statusRaw === 'aprovado') {
    return 'aprovado';
  }

  if (statusRaw === 'rejected' || statusRaw === 'recusado') {
    return 'recusado';
  }

  return 'pendente';
};

const toNumber = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
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

  const metadata = (user.user_metadata || {}) as Record<string, unknown>;

  const depositsRaw = Array.isArray(metadata.deposit_history) ? metadata.deposit_history : [];
  const withdrawalsRaw = Array.isArray(metadata.withdrawal_requests) ? metadata.withdrawal_requests : [];

  const deposits: FinancialHistoryItem[] = depositsRaw
    .map((item) => {
      const entry = (item || {}) as Record<string, unknown>;
      return {
        id: String(entry.id || ''),
        tipo: 'deposito' as const,
        status: 'aprovado' as const,
        amount: toNumber(entry.amount),
        createdAt: String(entry.createdAt || ''),
        paymentId: String(entry.paymentId || ''),
      };
    })
    .filter((entry) => entry.id && entry.amount > 0 && entry.createdAt);

  const withdrawals: FinancialHistoryItem[] = withdrawalsRaw
    .map((item) => {
      const entry = (item || {}) as Record<string, unknown>;
      return {
        id: String(entry.id || ''),
        tipo: 'saque' as const,
        status: parseWithdrawalStatus(entry.status),
        amount: toNumber(entry.amount),
        createdAt: String(entry.createdAt || ''),
        cpf: String(entry.cpf || ''),
      };
    })
    .filter((entry) => entry.id && entry.amount > 0 && entry.createdAt);

  const history = [...deposits, ...withdrawals].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return NextResponse.json({ history });
}
