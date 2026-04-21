import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AdminApiUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  last_sign_in_at?: string;
};

type PublicUserRecord = {
  id: string;
  email?: string | null;
  username?: string | null;
  cpf?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const getSupabaseUrl = () =>
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const getServiceRoleKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const getAdminEmails = () => {
  const rawValue = process.env.ADMIN_EMAIL || '';

  return new Set(
    rawValue
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
};

const readRoleRecord = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  userId: string
) => {
  const profileResult = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!profileResult.error) {
    return profileResult.data as { role?: string | null } | null;
  }

  const legacyResult = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (legacyResult.error) {
    throw new Error(legacyResult.error.message);
  }

  return legacyResult.data as { role?: string | null } | null;
};

export const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';

  if (!auth.toLowerCase().startsWith('bearer ')) return null;

  return auth.slice(7).trim();
};

export const getAnonSupabase = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
};

export const getAdminSupabase = () => {
  return createClient(getSupabaseUrl(), getServiceRoleKey());
};

export const ensureAdminRequest = async (request: Request) => {
  const token = getBearerToken(request);

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { error: 'NÃ£o autenticado.' },
        { status: 401 }
      ),
    };
  }

  const supabaseAdmin = getAdminSupabase();

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'UsuÃ¡rio nÃ£o autenticado.' },
        { status: 401 }
      ),
    };
  }

  let profile: { role?: string | null } | null = null;

  try {
    profile = await readRoleRecord(supabaseAdmin, user.id);
  } catch {
    return {
      errorResponse: NextResponse.json(
        { error: 'Erro ao validar permissÃµes.' },
        { status: 500 }
      ),
    };
  }

  const isEmailAdmin = getAdminEmails().has(String(user.email || '').trim().toLowerCase());
  const role = String(profile?.role || '').trim().toLowerCase();

  if (!isEmailAdmin && !profile) {
    return {
      errorResponse: NextResponse.json(
        { error: 'UsuÃ¡rio nÃ£o encontrado na base de permissÃµes.' },
        { status: 403 }
      ),
    };
  }

  if (!isEmailAdmin && role !== 'admin') {
    return {
      errorResponse: NextResponse.json(
        { error: 'Acesso negado.' },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    supabaseAdmin,
    errorResponse: null,
  };
};

export const listAllAuthUsers = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>
) => {
  const users: AdminApiUser[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } =
      await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error) throw new Error(error.message);

    const batch = (data.users || []) as AdminApiUser[];
    users.push(...batch);

    if (batch.length < perPage) break;

    page++;
  }

  return users;
};

const PUBLIC_USER_SELECT_VARIANTS = [
  'id, email, username, cpf, birth_date, avatar_url, role, created_at, updated_at',
  'id, email, username, cpf, birth_date, avatar_url, role',
  'id, email, username, cpf, birth_date, role',
  'id, email, username, role',
  'id, email, username',
  'id',
] as const;

const isMissingColumnError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('column') &&
    (normalized.includes('does not exist') || normalized.includes('could not find'))
  );
};

const isMissingProfilesSchemaError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('profiles') &&
    (
      normalized.includes('does not exist') ||
      normalized.includes('could not find') ||
      normalized.includes('schema cache') ||
      normalized.includes('column')
    )
  );
};

const readPublicUserRecords = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  table: 'profiles' | 'users',
  userIds: string[]
) => {
  const targetIds = userIds.filter(Boolean);

  for (const select of PUBLIC_USER_SELECT_VARIANTS) {
    let query = supabaseAdmin.from(table).select(select);

    if (targetIds.length) {
      query = query.in('id', targetIds);
    }

    const { data, error } = await query;

    if (!error) {
      return (data || []) as unknown as PublicUserRecord[];
    }

    const message = String(error.message || '');

    if (table === 'profiles') {
      if (!isMissingProfilesSchemaError(message)) {
        throw new Error(message);
      }
    } else if (!isMissingColumnError(message)) {
      throw new Error(message);
    }
  }

  return [] as PublicUserRecord[];
};

export const listKnownPublicUsers = async (
  supabaseAdmin: ReturnType<typeof getAdminSupabase>,
  userIds: string[]
) => {
  const profileRecords = await readPublicUserRecords(supabaseAdmin, 'profiles', userIds);

  if (profileRecords.length > 0) {
    return profileRecords;
  }

  return readPublicUserRecords(supabaseAdmin, 'users', userIds);
};

export const toNumber = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export const toStringArray = (value: unknown) => {
  return Array.isArray(value)
    ? value.map((item) => String(item))
    : [];
};

export const getUserDisplayName = (
  metadata: Record<string, unknown> | undefined,
  email?: string
) => {
  const username = String(metadata?.username || '').trim();
  if (username) return username;
  return email || 'Sem identificaÃ§Ã£o';
};
