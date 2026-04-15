import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  // 🔥 1. valida header
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Não autenticado' },
      { status: 401 }
    );
  }

  const token = authHeader.replace('Bearer ', '');

  // 🔥 2. conecta supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 🔥 3. valida usuário via token
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json(
      { error: 'Sessão inválida' },
      { status: 401 }
    );
  }

  // 🔥 4. busca role no banco (SISTEMA REAL)
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'Usuário não encontrado no banco' },
      { status: 403 }
    );
  }

  // 🔥 5. valida role
  if (profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Acesso negado (sem permissão)' },
      { status: 403 }
    );
  }

  // 🔥 6. sucesso
  return NextResponse.json({
    success: true,
    role: profile.role,
    user: {
      id: user.id,
      email: user.email,
    },
  });
}
