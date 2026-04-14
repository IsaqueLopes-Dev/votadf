import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { userId, adminEmail } = await req.json();

  // Verifica se o adminEmail está autorizado
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim()) || [];
  if (!adminEmails.includes(adminEmail)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  // Exclui o usuário do Supabase Auth
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Chama a função SQL para limpar dados relacionados
  const { error: rpcError } = await supabaseAdmin.rpc('delete_user_and_related', { user_id: userId });
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
