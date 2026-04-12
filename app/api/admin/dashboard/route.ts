import { NextResponse } from 'next/server';
import {
  ensureAdminRequest,
  getUserDisplayName,
  listAllAuthUsers,
  toNumber,
  toStringArray,
} from '../utils';

type RecentActivityItem = {
  id: string;
  type: 'votacao' | 'deposito';
  title: string;
  description: string;
  createdAt: string;
};

export async function GET(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  try {
    const [users, totalVotacoesResult, activeVotacoesResult, latestVotacoesResult] = await Promise.all([
      listAllAuthUsers(supabaseAdmin),
      supabaseAdmin.from('votacoes').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('votacoes').select('id', { count: 'exact', head: true }).eq('ativa', true),
      supabaseAdmin.from('votacoes').select('id, titulo, ativa, created_at').order('created_at', { ascending: false }).limit(4),
    ]);

    const totalUsuarios = users.length;
    const usersWithBalance = users.filter((user) => {
      const metadata = (user.user_metadata || {}) as Record<string, unknown>;
      return toNumber(metadata.balance ?? metadata.saldo) > 0;
    }).length;
    const totalTransactions = users.reduce((sum, user) => {
      const metadata = (user.user_metadata || {}) as Record<string, unknown>;
      return sum + toStringArray(metadata.credited_pix_payment_ids).length;
    }, 0);
    const totalBalance = users.reduce((sum, user) => {
      const metadata = (user.user_metadata || {}) as Record<string, unknown>;
      return sum + toNumber(metadata.balance ?? metadata.saldo);
    }, 0);

    const recentDeposits: RecentActivityItem[] = users
      .map((user) => {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const lastPixCreditAt = String(metadata.last_pix_credit_at || '');
        const creditedPixPaymentIds = toStringArray(metadata.credited_pix_payment_ids);

        if (!lastPixCreditAt || creditedPixPaymentIds.length === 0) {
          return null;
        }

        return {
          id: `deposit-${user.id}`,
          type: 'deposito' as const,
          title: `Crédito PIX para ${getUserDisplayName(metadata, user.email)}`,
          description: `${creditedPixPaymentIds.length} pagamento(s) aprovado(s) e saldo atual de R$ ${toNumber(metadata.balance ?? metadata.saldo).toFixed(2)}`,
          createdAt: lastPixCreditAt,
        };
      })
      .filter(Boolean) as RecentActivityItem[];

    const recentVotacoes: RecentActivityItem[] = (latestVotacoesResult.data || []).map((votacao) => ({
      id: `votacao-${votacao.id}`,
      type: 'votacao' as const,
      title: votacao.ativa ? `Votação ativa: ${votacao.titulo}` : `Votação inativa: ${votacao.titulo}`,
      description: votacao.ativa ? 'Disponível para todos no app.' : 'Oculta da vitrine pública até ser reativada.',
      createdAt: votacao.created_at,
    }));

    const recentActivity = [...recentDeposits, ...recentVotacoes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);

    return NextResponse.json({
      stats: {
        totalVotacoes: totalVotacoesResult.count || 0,
        activeVotacoes: activeVotacoesResult.count || 0,
        totalUsuarios,
        usersWithBalance,
        totalTransactions,
        totalBalance: Math.round(totalBalance * 100) / 100,
      },
      recentActivity,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar dashboard.' },
      { status: 500 }
    );
  }
}