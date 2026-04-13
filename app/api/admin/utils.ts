import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AdminApiUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  last_sign_in_at?: string;
};

const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const getServiceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const getAdminEmails = () => {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
};

export const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return auth.slice(7).trim();
};

export const getAnonSupabase = () => {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
};

export const getAdminSupabase = () => {
  return createClient(getSupabaseUrl(), getServiceRoleKey());
};

export const ensureAdminRequest = async (request: Request) => {
  const token = getBearerToken(request);

  if (!token) {
    return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  }

  if (!getServiceRoleKey()) {
    return { errorResponse: NextResponse.json({ error: 'Servidor sem service role configurada.' }, { status: 500 }) };
  }

  const anonSupabase = getAnonSupabase();
  const {
    data: { user },
    error,
  } = await anonSupabase.auth.getUser(token);

  if (error || !user?.email || !getAdminEmails().includes(user.email)) {
    return { errorResponse: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  }

  return {
    user,
    supabaseAdmin: getAdminSupabase(),
    errorResponse: null,
  };
};

export const listAllAuthUsers = async (supabaseAdmin: ReturnType<typeof getAdminSupabase>) => {
  const users: AdminApiUser[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data.users || []) as AdminApiUser[];
    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
};

export const toNumber = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export const toStringArray = (value: unknown) => {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
};

export const getUserDisplayName = (metadata: Record<string, unknown> | undefined, email?: string) => {
  const username = String(metadata?.username || '').trim();
  if (username) return username;
  return email || 'Sem identificação';
};