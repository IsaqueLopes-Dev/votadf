import { NextResponse } from 'next/server';
import {
  ensureAdminRequest,
  getUserDisplayName,
  listKnownPublicUsers,
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
    const authUsers = await listAllAuthUsers(supabaseAdmin);
    const authUsersById = new Map(authUsers.map((user) => [user.id, user]));
    const publicUsers = await listKnownPublicUsers(supabaseAdmin, authUsers.map((user) => user.id));
    const publicUserById = new Map(publicUsers.map((user) => [String(user.id), user]));
    const allUserIds = new Set([
      ...authUsers.map((user) => user.id),
      ...publicUsers.map((user) => String(user.id)),
    ]);

    const mappedUsers = Array.from(allUserIds)
      .map((userId) => {
        const authUser = authUsersById.get(userId);
        const publicUser = publicUserById.get(userId);
        const metadata = ((authUser?.user_metadata || {}) as Record<string, unknown>);
        const email = authUser?.email || String(publicUser?.email || '');
        const username = String(metadata.username || publicUser?.username || '');
        const cpf = String(metadata.cpf || publicUser?.cpf || '');
        const birthDate = String(metadata.birth_date || publicUser?.birth_date || '');
        const avatarUrl = String(metadata.avatar_url || publicUser?.avatar_url || '');
        const role = String(publicUser?.role || 'user');

        return {
          id: userId,
          email,
          displayName: username || getUserDisplayName(metadata, email),
          username,
          role,
          cpf,
          birthDate,
          avatarUrl,
          balance: toNumber(metadata.balance ?? metadata.saldo),
          transactionCount: toStringArray(metadata.credited_pix_payment_ids).length,
          lastPixCreditAt: String(metadata.last_pix_credit_at || ''),
          createdAt: authUser?.created_at || String(publicUser?.created_at || publicUser?.updated_at || ''),
          lastSignInAt: authUser?.last_sign_in_at || '',
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
