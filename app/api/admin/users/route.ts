import { NextResponse } from 'next/server';
import {
  ensureAdminRequest,
  getUserDisplayName,
  listAllAuthUsers,
  toNumber,
  toStringArray,
} from '../utils';

export async function GET(request: Request) {
  const { supabaseAdmin, errorResponse } = await ensureAdminRequest(request);

  if (errorResponse || !supabaseAdmin) {
    return errorResponse;
  }

  try {
    const users = await listAllAuthUsers(supabaseAdmin);
    const userIds = users.map((user) => user.id);
    const profileRolesResult = userIds.length
      ? await supabaseAdmin.from('profiles').select('id, role').in('id', userIds)
      : { data: [], error: null };
    const legacyRolesResult =
      profileRolesResult.error && userIds.length
        ? await supabaseAdmin.from('users').select('id, role').in('id', userIds)
        : { data: [], error: null };

    if (profileRolesResult.error && legacyRolesResult.error) {
      throw new Error(legacyRolesResult.error.message);
    }

    const roles = profileRolesResult.error ? legacyRolesResult.data : profileRolesResult.data;

    const roleByUserId = new Map(
      (roles || []).map((row) => [String(row.id), String(row.role || 'user')])
    );

    const mappedUsers = users
      .map((user) => {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;

        return {
          id: user.id,
          email: user.email || '',
          displayName: getUserDisplayName(metadata, user.email),
          username: String(metadata.username || ''),
          role: roleByUserId.get(user.id) || 'user',
          cpf: String(metadata.cpf || ''),
          birthDate: String(metadata.birth_date || ''),
          avatarUrl: String(metadata.avatar_url || ''),
          balance: toNumber(metadata.balance ?? metadata.saldo),
          transactionCount: toStringArray(metadata.credited_pix_payment_ids).length,
          lastPixCreditAt: String(metadata.last_pix_credit_at || ''),
          createdAt: user.created_at || '',
          lastSignInAt: user.last_sign_in_at || '',
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ users: mappedUsers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar usuários.' },
      { status: 500 }
    );
  }
}
