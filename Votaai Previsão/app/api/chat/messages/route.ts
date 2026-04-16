import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const RETENTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 280;
const MAX_MESSAGES = 200;

type ChatMessageRow = {
  id: string;
  user_id: string;
  username: string;
  message: string;
  avatar_url?: string;
  created_at: string;
};

const getBearerToken = (request: Request) => {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim();
};

const getAnonSupabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

const getAdminSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRole) {
    return null;
  }

  return createClient(supabaseUrl, serviceRole);
};

const getDisplayName = (user: User) => {
  const fromMetadata = String(user.user_metadata?.username || '').trim();
  if (fromMetadata) return fromMetadata;

  const email = String(user.email || '').trim();
  if (!email.includes('@')) return '@usuario';

  return `@${email.split('@')[0]}`;
};

const cleanupOldMessages = async (supabaseAdmin: SupabaseClient) => {
  const cutoff = new Date(Date.now() - RETENTION_WINDOW_MS).toISOString();
  await supabaseAdmin.from('live_chat_messages').delete().lt('created_at', cutoff);
};

const resolveAuthenticatedUser = async (request: Request) => {
  const token = getBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  }

  const anonSupabase = getAnonSupabase();
  const {
    data: { user },
    error,
  } = await anonSupabase.auth.getUser(token);

  if (error || !user) {
    return { error: NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 }) };
  }

  return { user };
};

export async function GET(request: Request) {
  const authResult = await resolveAuthenticatedUser(request);
  if ('error' in authResult) return authResult.error;

  const supabaseAdmin = getAdminSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Servidor sem configuração de chat.' }, { status: 500 });
  }

  await cleanupOldMessages(supabaseAdmin);

  const withAvatarQuery = await supabaseAdmin
    .from('live_chat_messages')
    .select('id, user_id, username, message, avatar_url, created_at')
    .order('created_at', { ascending: true })
    .limit(MAX_MESSAGES);

  let data = withAvatarQuery.data as ChatMessageRow[] | null;
  let error = withAvatarQuery.error;

  if (error && String(error.message || '').toLowerCase().includes('avatar_url')) {
    const fallbackQuery = await supabaseAdmin
      .from('live_chat_messages')
      .select('id, user_id, username, message, created_at')
      .order('created_at', { ascending: true })
      .limit(MAX_MESSAGES);

    if (fallbackQuery.error) {
      error = fallbackQuery.error;
      data = null;
    } else {
      error = null;
      data = (fallbackQuery.data || []).map((item) => ({
        ...item,
        avatar_url: '',
      })) as ChatMessageRow[];
    }
  }

  if (error) {
    return NextResponse.json(
      {
        error:
          'Não foi possível carregar o chat. Verifique se a tabela live_chat_messages existe no Supabase.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ messages: (data || []) as ChatMessageRow[] });
}

export async function POST(request: Request) {
  const authResult = await resolveAuthenticatedUser(request);
  if ('error' in authResult) return authResult.error;

  let body: { message?: string };
  try {
    body = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'Digite uma mensagem.' }, { status: 400 });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `A mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.` }, { status: 400 });
  }

  const supabaseAdmin = getAdminSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Servidor sem configuração de chat.' }, { status: 500 });
  }

  await cleanupOldMessages(supabaseAdmin);

  const payload = {
    user_id: authResult.user.id,
    username: getDisplayName(authResult.user),
    message,
    avatar_url: String(authResult.user.user_metadata?.avatar_url || '').trim(),
  };

  const withAvatarInsert = await supabaseAdmin
    .from('live_chat_messages')
    .insert(payload)
    .select('id, user_id, username, message, avatar_url, created_at')
    .single();

  let data = withAvatarInsert.data as ChatMessageRow | null;
  let error = withAvatarInsert.error;

  if (error && String(error.message || '').toLowerCase().includes('avatar_url')) {
    const fallbackInsert = await supabaseAdmin
      .from('live_chat_messages')
      .insert({
        user_id: payload.user_id,
        username: payload.username,
        message: payload.message,
      })
      .select('id, user_id, username, message, created_at')
      .single();

    if (fallbackInsert.error || !fallbackInsert.data) {
      error = fallbackInsert.error;
      data = null;
    } else {
      error = null;
      data = {
        ...(fallbackInsert.data as Omit<ChatMessageRow, 'avatar_url'>),
        avatar_url: '',
      };
    }
  }

  if (error || !data) {
    return NextResponse.json(
      {
        error:
          'Não foi possível enviar a mensagem. Verifique se a tabela live_chat_messages existe no Supabase.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: data as ChatMessageRow });
}
