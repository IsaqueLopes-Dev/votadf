import { NextResponse } from 'next/server';
import {
  getAdminSupabase,
  getAuthenticatedProfileContext,
  isValidBirthDate,
  isValidUsername,
  normalizeUsername,
  readBirthDateProfile,
  readPublicUserProfile,
  syncUnifiedProfile,
} from '../utils';

type ProfileUpdatePayload = {
  username?: unknown;
  cpf?: unknown;
  birth_date?: unknown;
  avatar_url?: unknown;
  identity_confirmed?: unknown;
};

const normalizeCpfDigits = (value: string) => value.replace(/\D/g, '');
type AdminSupabase = ReturnType<typeof getAdminSupabase>;

const findExistingUsername = async (
  supabaseAdmin: AdminSupabase,
  username: string,
  currentUserId: string
) => {
  const profileResult = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', currentUserId)
    .limit(1)
    .maybeSingle();

  if (!profileResult.error) {
    return profileResult.data;
  }

  const legacyResult = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('username', username)
    .neq('id', currentUserId)
    .limit(1)
    .maybeSingle();

  if (legacyResult.error) {
    throw new Error(legacyResult.error.message);
  }

  return legacyResult.data;
};

const listExistingCpfUsers = async (
  supabaseAdmin: AdminSupabase,
  currentUserId: string
) => {
  const profileResult = await supabaseAdmin
    .from('profiles')
    .select('id, cpf')
    .neq('id', currentUserId)
    .not('cpf', 'is', null);

  if (!profileResult.error) {
    return profileResult.data || [];
  }

  const legacyResult = await supabaseAdmin
    .from('users')
    .select('id, cpf')
    .neq('id', currentUserId)
    .not('cpf', 'is', null);

  if (legacyResult.error) {
    throw new Error(legacyResult.error.message);
  }

  return legacyResult.data || [];
};

export async function GET(request: Request) {
  const context = await getAuthenticatedProfileContext(request);

  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    const { profile } = await syncUnifiedProfile(context.adminSupabase, context.user);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao carregar perfil.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const context = await getAuthenticatedProfileContext(request);

  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await request.json().catch(() => ({}))) as ProfileUpdatePayload;
  const username = normalizeUsername(String(body.username || ''));
  const cpf = normalizeCpfDigits(String(body.cpf || ''));
  const birthDate = String(body.birth_date || '').trim();
  const avatarUrl = String(body.avatar_url || '').trim();
  const identityConfirmed = body.identity_confirmed === true;
  const currentMetadata = (context.user.user_metadata || {}) as Record<string, unknown>;
  const identityConfirmedAt = String(currentMetadata.identity_confirmed_at || '').trim();
  const isIdentityLocked = Boolean(identityConfirmedAt);

  if (!username || !isValidUsername(username)) {
    return NextResponse.json({ error: 'Nome de usuário inválido.' }, { status: 400 });
  }

  if (!cpf) {
    return NextResponse.json({ error: 'CPF obrigatório.' }, { status: 400 });
  }

  if (!birthDate || !isValidBirthDate(birthDate)) {
    return NextResponse.json({ error: 'Data de nascimento inválida.' }, { status: 400 });
  }

  try {
    const currentPublicUser = await readPublicUserProfile(context.adminSupabase, context.user.id);
    const currentBirthDateProfile = await readBirthDateProfile(context.adminSupabase, context.user.id);
    const currentBirthDate =
      String(currentPublicUser?.birth_date || '').trim() ||
      String(currentBirthDateProfile?.birth_date || '').trim() ||
      String(context.user.user_metadata?.birth_date || '').trim();

    const currentCpf =
      normalizeCpfDigits(String(currentPublicUser?.cpf || '').trim()) ||
      normalizeCpfDigits(String(context.user.user_metadata?.cpf || '').trim());

    if (isIdentityLocked && currentBirthDate && currentBirthDate !== birthDate) {
      return NextResponse.json(
        { error: 'Data de nascimento ja cadastrada. So admin pode alterar.' },
        { status: 403 }
      );
    }

    if (isIdentityLocked && currentCpf && currentCpf !== cpf) {
      return NextResponse.json(
        { error: 'CPF ja confirmado. So admin pode alterar esse dado.' },
        { status: 403 }
      );
    }

    const existingUser = await findExistingUsername(context.adminSupabase, username, context.user.id);

    if (existingUser) {
      return NextResponse.json({ error: 'Esse nome de usuário já está em uso.' }, { status: 409 });
    }

    const existingCpfUsers = await listExistingCpfUsers(context.adminSupabase, context.user.id);

    const cpfAlreadyInUse = existingCpfUsers?.some(
      (user) => normalizeCpfDigits(String(user.cpf || '')) === cpf
    );

    if (cpfAlreadyInUse) {
      return NextResponse.json({ error: 'Já existe um usuário com este CPF.' }, { status: 409 });
    }

    const { profile, user } = await syncUnifiedProfile(context.adminSupabase, context.user, {
      username,
      cpf,
      birth_date: birthDate,
      avatar_url: avatarUrl,
    });

    let nextIdentityConfirmedAt = identityConfirmedAt;

    if (!identityConfirmedAt && identityConfirmed) {
      nextIdentityConfirmedAt = new Date().toISOString();
      const nextUserMetadata = {
        ...(user.user_metadata || {}),
        identity_confirmed_at: nextIdentityConfirmedAt,
      };

      const { error } = await context.adminSupabase.auth.admin.updateUserById(user.id, {
        user_metadata: nextUserMetadata,
      });

      if (error) {
        throw new Error(error.message);
      }
    }

    return NextResponse.json({ profile, identityConfirmedAt: nextIdentityConfirmedAt || null });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao salvar perfil.' },
      { status: 500 }
    );
  }
}
