'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../utils/supabaseClient';

const BASELINE_ONLINE_COUNT = 366;

const getPresenceTotal = (state: Record<string, unknown>) =>
  Object.values(state).reduce((total, value) => {
    if (Array.isArray(value)) {
      return total + value.length;
    }

    return total + 1;
  }, 0);

export default function OnlineIndicator() {
  const [onlineCount, setOnlineCount] = useState(BASELINE_ONLINE_COUNT + 1);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const presenceKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase.channel('site-online-presence', {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const total = getPresenceTotal(channel.presenceState() as Record<string, unknown>);
      setOnlineCount(BASELINE_ONLINE_COUNT + Math.max(total, 1));
    });

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;

      await channel.track({
        joined_at: new Date().toISOString(),
        page: typeof window !== 'undefined' ? window.location.pathname : '/',
      });
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-300">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
      </span>
      <span>{onlineCount} online</span>
    </div>
  );
}
