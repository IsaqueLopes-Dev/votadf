"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useState } from "react";

export default function CandidatoLink({ votacaoId, children, className }: { votacaoId: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const nextPath = `/home?participar=${encodeURIComponent(votacaoId)}`;
        router.push(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      router.push(`/home?participar=${encodeURIComponent(votacaoId)}`);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <a href={`/home?participar=${encodeURIComponent(votacaoId)}`} className={className} onClick={handleClick} tabIndex={0} role="button">
      {loading ? "Verificando..." : children}
    </a>
  );
}
