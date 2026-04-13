'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import BottomNavigation from '../../components/bottom-navigation';

type ChatMessageItem = {
  id: string;
  user_id: string;
  username: string;
  message: string;
  avatar_url?: string;
  created_at: string;
};

export default function ChatPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const loadMessages = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessages([]);
        return;
      }

      const response = await fetch('/api/chat/messages', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json()) as { messages?: ChatMessageItem[]; error?: string };

      if (!response.ok) {
        setError(payload.error || 'Não foi possível carregar o chat.');
        return;
      }

      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setError(null);
    } catch {
      setError('Não foi possível carregar o chat.');
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login?next=/chat');
          return;
        }

        setUser(user);
        await loadMessages();
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(() => {
      void loadMessages();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    const message = chatInput.trim();
    if (!message || !user) return;

    setSending(true);
    setError(null);

    const optimisticMessage: ChatMessageItem = {
      id: `tmp-${Date.now()}`,
      user_id: String(user.id || ''),
      username: String(user.user_metadata?.username || (user.email ? `@${user.email.split('@')[0]}` : '@usuario')),
      message,
      avatar_url: String(user.user_metadata?.avatar_url || ''),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setChatInput('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Sessão expirada. Faça login novamente.');
        setMessages((prev) => prev.filter((item) => item.id !== optimisticMessage.id));
        return;
      }

      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message }),
      });

      const payload = (await response.json()) as { message?: ChatMessageItem; error?: string };

      if (!response.ok) {
        setError(payload.error || 'Não foi possível enviar a mensagem.');
        setMessages((prev) => prev.filter((item) => item.id !== optimisticMessage.id));
        return;
      }

      setMessages((prev) => prev.map((item) => (item.id === optimisticMessage.id ? (payload.message as ChatMessageItem) : item)));
    } catch {
      setError('Não foi possível enviar a mensagem.');
      setMessages((prev) => prev.filter((item) => item.id !== optimisticMessage.id));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white" style={{ fontFamily: 'var(--font-poppins), sans-serif' }}>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0f0f0f]/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/80">Conversa ao vivo</p>
            <h1 className="mt-1 text-xl font-bold text-white">Chat</h1>
          </div>
          <button
            type="button"
            onClick={() => router.push('/mercados')}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Mercados
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-4xl flex-col px-3 pb-36 pt-4">
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Carregando mensagens...
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto pb-4">
            {messages.length > 0 ? (
              messages.map((message) => {
                const isOwnMessage = message.user_id === user?.id;
                const avatarUrlToRender = String(message.avatar_url || '').trim();
                const initial = String(message.username || '@usuario').replace('@', '').trim().slice(0, 1).toUpperCase() || 'U';

                return (
                  <div
                    key={message.id}
                    className={`max-w-[88%] rounded-3xl border px-4 py-3 shadow-[0_14px_40px_-24px_rgba(0,0,0,0.6)] ${
                      isOwnMessage
                        ? 'ml-auto border-blue-500/30 bg-blue-500/14'
                        : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-xs font-bold text-slate-200">
                          {avatarUrlToRender ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrlToRender} alt={message.username || '@usuario'} className="h-full w-full object-cover" />
                          ) : (
                            <span>{initial}</span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-blue-300">{message.username || '@usuario'}</p>
                      </div>
                      <p className="text-[11px] text-slate-500">{new Date(message.created_at).toLocaleTimeString('pt-BR')}</p>
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-100">{message.message}</p>
                  </div>
                );
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-center text-sm text-slate-400">
                Nenhuma mensagem ainda. Seja o primeiro a conversar.
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {error && (
        <div className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-30 mx-auto max-w-4xl rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 backdrop-blur">
          {error}
        </div>
      )}

      <div
        className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-white/8 bg-[#0f0f0f]/96 backdrop-blur-xl"
      >
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-3 py-3">
          <input
            type="text"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSendMessage();
              }
            }}
            maxLength={280}
            placeholder="Digite sua mensagem"
            className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-white/[0.08]"
          />
          <button
            type="button"
            onClick={() => void handleSendMessage()}
            disabled={sending || !chatInput.trim()}
            className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? '...' : 'Enviar'}
          </button>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
}
