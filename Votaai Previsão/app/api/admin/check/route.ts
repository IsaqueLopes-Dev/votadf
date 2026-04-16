import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    console.log('==== ADMIN CHECK START ====');

    const authHeader = req.headers.get('authorization');

    // 🔥 1. valida header
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('ERRO: sem token');
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // 🔥 2. Supabase client (SERVER SIDE)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🔥 3. valida token e pega usuário real
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    console.log('AUTH USER:', user);
    console.log('AUTH ERROR:', userError);

    if (userError || !user) {
      console.log('ERRO: sessão inválida');
      return NextResponse.json(
        { error: 'Sessão inválida' },
        { status: 401 }
      );
    }

    // 🔥 4. busca role no banco (RBAC real)
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*') // <- melhor para debug
      .eq('id', user.id);

    console.log('PROFILE RAW:', profile);
    console.log('PROFILE ERROR:', profileError);

    if (profileError) {
      return NextResponse.json(
        { error: 'Erro ao buscar usuário' },
        { status: 500 }
      );
    }

    if (!profile || profile.length === 0) {
      console.log('ERRO: usuário não encontrado no banco');
      return NextResponse.json(
        { error: 'Usuário não encontrado no banco' },
        { status: 403 }
      );
    }

    const userProfile = profile[0];

    console.log('ROLE ENCONTRADA:', userProfile.role);

    // 🔥 5. valida role
    if (userProfile.role !== 'admin') {
      console.log('ACESSO NEGADO PARA ROLE:', userProfile.role);
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    // 🔥 6. sucesso
    console.log('ACESSO LIBERADO');

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: userProfile.role,
      },
    });

  } catch (err) {
    console.error('ERRO INTERNO:', err);

    return NextResponse.json(
      { error: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
