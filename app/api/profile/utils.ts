import { createClient, type User } from '@supabase/supabase-js';

type PublicUserRow = Record<string, unknown> | null;
type ProfileRow = {
  birth_date?: unknown;
} | null;

export type UnifiedProfile = {
  id: string;
  email: string;
  username: string;
  cpf: string;
  birth_date: string;
  avatar_url: string;
  role: string;
};

type AuthenticatedProfileContext = {
  user: User;
  anonSupabase: ReturnType<typeof getAnonSupabase>;
  adminSupabase: ReturnType<typeof getAdminSupabase>;
  status: 200;
};

type AuthenticatedUnifiedProfileContext = AuthenticatedProfileContext & {
  user: User;
  profile: UnifiedProfile;
  status: 200;
};

type AuthErrorContext = {
  error: string;
  status: 401 | 500;
};

const PROFILE_SELECT_VARIANTS = [
  'id, email, username, cpf, birth_date, avatar_url, role',
  'id, email, username, cpf, birth_date, role',
  'id, email, username, role',
  'id, role',
] as const;

const USER_UPSERT_VARIANTS = [
  ['id', 'email', 'username', 'cpf', 'birth_date', 'avatar_url'],
  ['id', 'email', 'username', 'cpf', 'birth_date'],
  ['id', 'email', 'username'],
  ['id', 'email'],
  ['id'],
] as const;

const getSupabaseUrl = () =>
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const getAnonKey = () =>
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const getServiceRoleKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const toString = (value: unknown) => String(value || '').trim();

const isMissingColumnError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('column') &&
    (normalized.includes('does not exist') || normalized.includes('could not find'))
  );
};

export const normalizeUsername = (value: string) => {
  const withoutSpaces = value.replace(/\s+/g, '');
  if (!withoutSpaces) return '';
  const normalized = withoutSpaces.startsWith('@')
    ? withoutSpaces
    : `@${withoutSpaces.replace(/^@+/, '')}`;
  return normalized.toLowerCase();
};

export const isValidUsername = (value: string) =>
  /^@[^\s]+$/.test(value) && value.length >= 4;

export const isValidBirthDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

export const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
};

export const getAnonSupabase = () =>
  createClient(getSupabaseUrl(), getAnonKey());

export const getAdminSupabase = () =>
  createClient(getSupabaseUrl(), getServiceRoleKey());

export const getAuthenticatedProfileContext = async (
  request: Request
): Promise<AuthenticatedProfileContext | AuthErrorContext> => {
  const token = getBearerToken(request);

  if (!token) {
    return { error: 'Nao autenticado.', status: 401 as const };
  }

  if (!getSupabaseUrl() || !getAnonKey() || !getServiceRoleKey()) {
    return { error: 'Supabase nao configurado.', status: 500 as const };
  }

  const anonSupabase = getAnonSupabase();
  const adminSupabase = getAdminSupabase();

  const {
    data: { user },
    error,
  } = await anonSupabase.auth.getUser(token);

  if (error || !user) {
    return { error: 'Sessao invalida.', status: 401 as const };
  }

  return { user, anonSupabase, adminSupabase, status: 200 as const };
};

export const getAuthenticatedUnifiedProfileContext = async (
  request: Request
): Promise<AuthenticatedUnifiedProfileContext | AuthErrorContext> => {
  const context = await getAuthenticatedProfileContext(request);

  if ('error' in context) {
    return context;
  }

  const { user, profile } = await syncUnifiedProfile(context.adminSupabase, context.user);

  return {
    ...context,
    user,
    profile,
    status: 200 as const,
  };
};

export const readPublicUserProfile = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  userId: string
) => {
  for (const select of PROFILE_SELECT_VARIANTS) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(select)
      .eq('id', userId)
      .maybeSingle();

    if (!error) {
      return data as PublicUserRow;
    }

    if (!isMissingColumnError(String(error.message || ''))) {
      throw new Error(error.message);
    }
  }

  return null;
};

export const readBirthDateProfile = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  userId: string
) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('birth_date')
    .eq('id', userId)
    .maybeSingle();

  if (error && !String(error.message || '').toLowerCase().includes('0 rows')) {
    throw new Error(error.message);
  }

  return (data || null) as ProfileRow;
};

export const buildUnifiedProfile = (
  user: User,
  publicUser: PublicUserRow,
  profileRow: ProfileRow
): UnifiedProfile => {
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;

  return {
    id: user.id,
    email: toString(publicUser?.email) || toString(user.email),
    username:
      toString(publicUser?.username) ||
      toString(metadata.username) ||
      (user.email ? `@${user.email.split('@')[0]}` : ''),
    cpf: toString(publicUser?.cpf) || toString(metadata.cpf),
    birth_date:
      toString(publicUser?.birth_date) ||
      toString(profileRow?.birth_date) ||
      toString(metadata.birth_date),
    avatar_url: toString(publicUser?.avatar_url) || toString(metadata.avatar_url),
    role: toString(publicUser?.role) || 'user',
  };
};

const upsertPublicUserProfile = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  profile: UnifiedProfile
) => {
  const source: Record<string, string> = {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    cpf: profile.cpf,
    birth_date: profile.birth_date,
    avatar_url: profile.avatar_url,
  };

  for (const fields of USER_UPSERT_VARIANTS) {
    const payload = Object.fromEntries(
      fields.map((field) => [field, source[field]])
    );

    const { error } = await supabaseAdmin
      .from('users')
      .upsert(payload, { onConflict: 'id' });

    if (!error) {
      return;
    }

    if (!isMissingColumnError(String(error.message || ''))) {
      throw new Error(error.message);
    }
  }
};

const updateAuthMetadata = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  user: User,
  profile: UnifiedProfile
) => {
  const currentMetadata = (user.user_metadata || {}) as Record<string, unknown>;
  const nextMetadata: Record<string, unknown> = {
    ...currentMetadata,
    username: profile.username,
    cpf: profile.cpf,
    birth_date: profile.birth_date,
    avatar_url: profile.avatar_url,
  };

  const hasChanges =
    toString(currentMetadata.username) !== profile.username ||
    toString(currentMetadata.cpf) !== profile.cpf ||
    toString(currentMetadata.birth_date) !== profile.birth_date ||
    toString(currentMetadata.avatar_url) !== profile.avatar_url;

  if (!hasChanges) {
    return user;
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.user || user;
};

export const syncUnifiedProfile = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  user: User,
  updates: Partial<UnifiedProfile> = {}
) => {
  const publicUser = await readPublicUserProfile(supabaseAdmin, user.id);
  const profileRow = await readBirthDateProfile(supabaseAdmin, user.id);
  const currentProfile = buildUnifiedProfile(user, publicUser, profileRow);

  const nextProfile: UnifiedProfile = {
    ...currentProfile,
    email: toString(user.email) || currentProfile.email,
    username: toString(updates.username) || currentProfile.username,
    cpf: toString(updates.cpf) || currentProfile.cpf,
    birth_date: toString(updates.birth_date) || currentProfile.birth_date,
    avatar_url: toString(updates.avatar_url) || currentProfile.avatar_url,
  };

  await upsertPublicUserProfile(supabaseAdmin, nextProfile);

  if (nextProfile.birth_date) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: user.id, birth_date: nextProfile.birth_date }, { onConflict: 'id' });

    if (error) {
      throw new Error(error.message);
    }
  }

  const updatedUser = await updateAuthMetadata(supabaseAdmin, user, nextProfile);
  const syncedPublicUser = await readPublicUserProfile(supabaseAdmin, user.id);
  const syncedBirthDate = await readBirthDateProfile(supabaseAdmin, user.id);

  return {
    user: updatedUser,
    profile: buildUnifiedProfile(updatedUser, syncedPublicUser, syncedBirthDate),
  };
};
