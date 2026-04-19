import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const normalizeUsername = (value: string) => {
  const withoutSpaces = value.replace(/\s+/g, '');
  if (!withoutSpaces) return '';
  const normalized = withoutSpaces.startsWith('@') ? withoutSpaces : `@${withoutSpaces.replace(/^@+/, '')}`;
  return normalized.toLowerCase();
};

const isValidUsername = (value: string) => /^@[^\s]+$/.test(value) && value.length >= 4;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = normalizeUsername(searchParams.get('username') || '');
  const excludeUserId = searchParams.get('excludeUserId') || '';

  if (!username || !isValidUsername(username)) {
    return NextResponse.json({ available: false, reason: 'invalid' }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ available: false, reason: 'server-misconfigured' }, { status: 500 });
  }

  try {
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', username)
      .neq('id', excludeUserId || '00000000-0000-0000-0000-000000000000')
      .limit(1)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ available: false, reason: profileError.message }, { status: 500 });
    }

    if (existingProfile) {
      return NextResponse.json({ available: false, reason: 'taken' });
    }

    let page = 1;
    const perPage = 100;

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

      if (error) {
        return NextResponse.json({ available: false, reason: error.message }, { status: 500 });
      }

      const users = data.users || [];
      const found = users.find((user) => {
        if (excludeUserId && user.id === excludeUserId) {
          return false;
        }

        const existingUsername = normalizeUsername(String(user.user_metadata?.username || ''));
        return existingUsername === username;
      });

      if (found) {
        return NextResponse.json({ available: false, reason: 'taken' });
      }

      if (users.length < perPage) {
        break;
      }

      page += 1;
    }

    return NextResponse.json({ available: true });
  } catch (error: unknown) {
    return NextResponse.json({ available: false, reason: getErrorMessage(error, 'unknown-error') }, { status: 500 });
  }
}
