import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AdminApiUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  last_sign_in_at?: string;
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
