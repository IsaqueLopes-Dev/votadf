"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase"; // ✅ corrigido aqui

export default function CandidatoLink({ 
  votacaoId, 
  children, 
  className 
}: { 
  votacaoId: string; 
  children: React.ReactNode; 
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        const nextPath = `/home?participar=${encodeURIComponent(votacaoId)}`;
        router.push(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      router.push(`/home?participar=${encodeURIComponent(votacaoId)}`);
    } catch (error) {
      console.error("Error checking user:", error);
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
    >
      {loading ? "Verificando..." : children}
    </a>
  );
}
