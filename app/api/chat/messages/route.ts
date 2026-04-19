import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUnifiedProfileContext } from '../../profile/utils';

const RETENTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 280;
const MAX_MESSAGES = 200;
const COMMENT_PREFIX = '__bet_comment__:';

type ChatMessageRow = {
  id: string;
  user_id: string;
  username: string;
  message: string;
  avatar_url?: string;
  created_at: string;
};

const getAdminSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRole) {
    return null;
  }

  return createClient(supabaseUrl, serviceRole);
};

const cleanupOldMessages = async (supabaseAdmin: SupabaseClient) => {
  const cutoff = new Date(Date.now() - RETENTION_WINDOW_MS).toISOString();
  await supabaseAdmin.from('live_chat_messages').delete().lt('created_at', cutoff);
};

const resolveAuthenticatedUser = async (request: Request) => {
  const context = await getAuthenticatedUnifiedProfileContext(request);

  if ('error' in context) {
    return { error: NextResponse.json({ error: context.error }, { status: context.status }) };
  }

  return context;
};

export async function GET(request: Request) {
  const authResult = await resolveAuthenticatedUser(request);
  if ('error' in authResult) return authResult.error;

  const supabaseAdmin = getAdminSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Servidor sem configuraÃ§Ã£o de chat.' }, { status: 500 });
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
          'NÃ£o foi possÃ­vel carregar o chat. Verifique se a tabela live_chat_messages existe no Supabase.',
      },
      { status: 500 }
    );
  }

  const messages = ((data || []) as ChatMessageRow[]).filter((item) => !item.message.startsWith(COMMENT_PREFIX));

  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const authResult = await resolveAuthenticatedUser(request);
  if ('error' in authResult) return authResult.error;

  let body: { message?: string };
  try {
    body = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: 'Payload invÃ¡lido.' }, { status: 400 });
  }

  const message = String(body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'Digite uma mensagem.' }, { status: 400 });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `A mensagem pode ter no mÃ¡ximo ${MAX_MESSAGE_LENGTH} caracteres.` }, { status: 400 });
  }

  const supabaseAdmin = getAdminSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Servidor sem configuraÃ§Ã£o de chat.' }, { status: 500 });
  }

  await cleanupOldMessages(supabaseAdmin);

  const payload = {
    user_id: authResult.user.id,
    username: authResult.profile.username || '@usuario',
    message,
    avatar_url: authResult.profile.avatar_url,
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
          'NÃ£o foi possÃ­vel enviar a mensagem. Verifique se a tabela live_chat_messages existe no Supabase.',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: data as ChatMessageRow });
}
