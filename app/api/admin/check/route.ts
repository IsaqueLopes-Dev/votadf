import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });


  // Busca o email do usuário pelo id
  const { data: profile } = await supabase
    .from('users')
    .select('email')
    .eq('id', user.id)
    .single();

  // Usa variável de ambiente para o email do admin
  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();
  const profileEmail = (profile?.email || '').trim().toLowerCase();

  if (userEmail !== ADMIN_EMAIL && profileEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
