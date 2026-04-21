import { createClient } from '@supabase/supabase-js';
import type { VotingRecord } from './voting-market';

const PUBLIC_QUERY_TIMEOUT_MS = 5000;

const getSupabaseCredentials = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return { supabaseUrl, supabaseKey };
};

export async function getPublicVotacoes() {
  try {
    const credentials = getSupabaseCredentials();
    if (!credentials) {
      return [] as VotingRecord[];
    }

    const supabase = createClient(credentials.supabaseUrl, credentials.supabaseKey);
    const query = supabase
      .from('votacoes')
      .select('id, titulo, descricao, opcoes, ativa, created_at')
      .order('created_at', { ascending: false });
    const { data, error } = await Promise.race([
      query,
      new Promise<{ data: null; error: Error }>((resolve) => {
        setTimeout(() => {
          resolve({
            data: null,
            error: new Error('Timed out while loading public voting markets.'),
          });
        }, PUBLIC_QUERY_TIMEOUT_MS);
      }),
    ]);

    if (error) {
      return [] as VotingRecord[];
    }

    return (data || []) as VotingRecord[];
  } catch {
    return [] as VotingRecord[];
  }
}

export async function getPublicVotacaoById(id: string) {
  try {
    const credentials = getSupabaseCredentials();
    if (!credentials) {
      return null;
    }

    const supabase = createClient(credentials.supabaseUrl, credentials.supabaseKey);
    const query = supabase
      .from('votacoes')
      .select('id, titulo, descricao, opcoes, ativa, created_at')
      .eq('id', id)
      .maybeSingle();
    const { data, error } = await Promise.race([
      query,
      new Promise<{ data: null; error: Error }>((resolve) => {
        setTimeout(() => {
          resolve({
            data: null,
            error: new Error('Timed out while loading the selected voting market.'),
          });
        }, PUBLIC_QUERY_TIMEOUT_MS);
      }),
    ]);

    if (error || !data) {
      return null;
    }

    return data as VotingRecord;
  } catch {
    return null;
  }
}
