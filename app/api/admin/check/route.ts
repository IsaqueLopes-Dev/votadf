import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 🔥 PASSA O TOKEN AQUI (ESSENCIAL)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
  }

  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();

  if (userEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
