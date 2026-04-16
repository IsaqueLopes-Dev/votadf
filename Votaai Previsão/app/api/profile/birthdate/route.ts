import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { birth_date } = await req.json();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Busca perfil
  const { data: profile } = await supabase.from('profiles').select('birth_date').eq('id', user.id).single();

  // Só permite se birth_date ainda não foi preenchido
  if (profile?.birth_date) {
    return NextResponse.json({ error: 'Data de nascimento já cadastrada. Só admin pode alterar.' }, { status: 403 });
  }

  // Atualiza
  const { error } = await supabase.from('profiles').update({ birth_date }).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
