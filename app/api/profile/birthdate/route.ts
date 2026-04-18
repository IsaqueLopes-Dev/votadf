import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
};

type BirthDatePayload = {
  birth_date?: unknown;
};

export async function POST(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const body = (await request.json().catch(() => ({}))) as BirthDatePayload;
  const birthDate = String(body.birth_date || '').trim();

  if (!birthDate) {
    return NextResponse.json({ error: 'Data de nascimento inválida.' }, { status: 400 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('birth_date')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError && !String(profileError.message || '').toLowerCase().includes('0 rows')) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (profile?.birth_date) {
    return NextResponse.json(
      { error: 'Data de nascimento já cadastrada. Só admin pode alterar.' },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('profiles').upsert({ id: user.id, birth_date: birthDate });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
