"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function CandidatoLink({
  votacaoId,
  children,
  className,
}: {
  votacaoId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        const nextPath = `/home?participar=${encodeURIComponent(votacaoId)}`;
        router.push(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      router.push(`/home?participar=${encodeURIComponent(votacaoId)}`);
    } catch (err) {
      // Mostra o erro no console para auxiliar no debug.
      console.error("Error checking user:", err);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <a
      href={`/home?participar=${encodeURIComponent(votacaoId)}`}
      className={className}
      onClick={handleClick}
      aria-busy={loading}
      aria-label={loading ? "Verificando autenticação..." : undefined}
      tabIndex={loading ? -1 : 0}
      style={{ pointerEvents: loading ? "none" : undefined }}
    >
      {loading ? "Verificando..." : children}
    </a>
  );
}
