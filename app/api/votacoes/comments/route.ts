import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const COMMENT_PREFIX = '__bet_comment__:';
const COMMENT_RETENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_COMMENT_LENGTH = 220;
const MAX_COMMENTS_PER_CARD = 50;

type CommentRow = {
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

const getCommentPrefix = (votacaoId: string) => `${COMMENT_PREFIX}${votacaoId}:`;

const buildStoredMessage = (votacaoId: string, message: string) => `${getCommentPrefix(votacaoId)}${message}`;

const parseStoredComment = (row: CommentRow, votacaoId: string) => {
  const prefix = getCommentPrefix(votacaoId);
  if (!row.message.startsWith(prefix)) {
    return null;
  }

  return {
    ...row,
    votacao_id: votacaoId,
    message: row.message.slice(prefix.length).trim(),
  };
};

const cleanupOldComments = async (supabaseAdmin: SupabaseClient) => {
  const cutoff = new Date(Date.now() - COMMENT_RETENTION_WINDOW_MS).toISOString();
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
  const votacaoId = new URL(request.url).searchParams.get('votacaoId')?.trim() || '';

  if (!votacaoId) {
    return NextResponse.json({ error: 'votacaoId é obrigatório.' }, { status: 400 });
  }

  const supabaseAdmin = getAdminSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Servidor sem configuração de comentários.' }, { status: 500 });
  }

  await cleanupOldComments(supabaseAdmin);

  const withAvatarQuery = await supabaseAdmin
    .from('live_chat_messages')
    .select('id, user_id, username, message, avatar_url, created_at')
    .ilike('message', `${getCommentPrefix(votacaoId)}%`)
    .order('created_at', { ascending: true })
    .limit(MAX_COMMENTS_PER_CARD);

  let data = withAvatarQuery.data as CommentRow[] | null;
  let error = withAvatarQuery.error;

  if (error && String(error.message || '').toLowerCase().includes('avatar_url')) {
    const fallbackQuery = await supabaseAdmin
      .from('live_chat_messages')
      .select('id, user_id, username, message, created_at')
      .ilike('message', `${getCommentPrefix(votacaoId)}%`)
      .order('created_at', { ascending: true })
      .limit(MAX_COMMENTS_PER_CARD);

    if (fallbackQuery.error) {
      error = fallbackQuery.error;
      data = null;
    } else {
      error = null;
      data = (fallbackQuery.data || []).map((item) => ({
        ...item,
        avatar_url: '',
      })) as CommentRow[];
    }
  }

  if (error) {
    return NextResponse.json({ error: 'Não foi possível carregar os comentários.' }, { status: 500 });
  }

  const comments = (data || [])
    .map((row) => parseStoredComment(row, votacaoId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return NextResponse.json({ comments });
}

export async function POST(request: Request) {
  const authResult = await resolveAuthenticatedUser(request);
  if ('error' in authResult) return authResult.error;

  let body: { votacaoId?: string; message?: string };
  try {
    body = (await request.json()) as { votacaoId?: string; message?: string };
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const votacaoId = String(body.votacaoId || '').trim();
  const message = String(body.message || '').trim();

  if (!votacaoId) {
    return NextResponse.json({ error: 'votacaoId é obrigatório.' }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: 'Digite um comentário.' }, { status: 400 });
  }

  if (message.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: `O comentário pode ter no máximo ${MAX_COMMENT_LENGTH} caracteres.` }, { status: 400 });
  }

  const supabaseAdmin = getAdminSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Servidor sem configuração de comentários.' }, { status: 500 });
  }

  await cleanupOldComments(supabaseAdmin);

  const payload = {
    user_id: authResult.user.id,
    username: getDisplayName(authResult.user),
    message: buildStoredMessage(votacaoId, message),
    avatar_url: String(authResult.user.user_metadata?.avatar_url || '').trim(),
  };

  const withAvatarInsert = await supabaseAdmin
    .from('live_chat_messages')
    .insert(payload)
    .select('id, user_id, username, message, avatar_url, created_at')
    .single();

  let data = withAvatarInsert.data as CommentRow | null;
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
        ...(fallbackInsert.data as Omit<CommentRow, 'avatar_url'>),
        avatar_url: '',
      };
    }
  }

  if (error || !data) {
    return NextResponse.json({ error: 'Não foi possível publicar o comentário.' }, { status: 500 });
  }

  const parsedComment = parseStoredComment(data, votacaoId);
  if (!parsedComment) {
    return NextResponse.json({ error: 'Não foi possível processar o comentário.' }, { status: 500 });
  }

  return NextResponse.json({ comment: parsedComment });
}
