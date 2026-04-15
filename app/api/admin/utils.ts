
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
  console.log('CHEGOU NO ADMIN 🔥');

  const token = getBearerToken(request);

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401 }
      ),
    };
  }

  const supabase = getAnonSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 }
      ),
    };
  }

  console.log('AUTH USER ID:', user.id);
  console.log('AUTH EMAIL:', user.email);

  // 🔥 BUSCA POR ID (CORRETO E SEGURO)
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  console.log('PROFILE:', profile);
  console.log('PROFILE ERROR:', profileError);

  // 🔥 CHECAGEM ROBUSTA
  if (profileError) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Erro ao validar permissões.' },
        { status: 500 }
      ),
    };
  }

  if (!profile) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Usuário não encontrado na base de permissões.' },
        { status: 403 }
      ),
    };
  }

  if (profile.role !== 'admin') {
    return {
      errorResponse: NextResponse.json(
        { error: 'Acesso negado.' },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    supabaseAdmin: getAdminSupabase(),
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
  const amount = Number(value
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
  return email || 'Sem identificação';
};
