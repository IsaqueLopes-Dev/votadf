import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 10;

const PUBLIC_CACHE_HEADER = 'public, max-age=10, s-maxage=10, stale-while-revalidate=20';

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { votacoes: [] },
        { headers: { 'Cache-Control': PUBLIC_CACHE_HEADER } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('votacoes')
      .select('id, titulo, descricao, opcoes, ativa, created_at')
      .eq('ativa', true)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 500,
          headers: { 'Cache-Control': PUBLIC_CACHE_HEADER },
        }
      );
    }

    return NextResponse.json(
      { votacoes: data || [] },
      { headers: { 'Cache-Control': PUBLIC_CACHE_HEADER } }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao buscar votações públicas.' },
      {
        status: 500,
        headers: { 'Cache-Control': PUBLIC_CACHE_HEADER },
      }
    );
  }
}
