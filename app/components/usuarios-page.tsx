"use client";
import { Suspense, useEffect, useState } from "react";
// ATENÇÃO: use o seu Supabase helper correto!
import { createClient } from "@/lib/supabase";
import CategoryCarousel from "@/app/components/category-carousel";
import BottomNavigation from "@/app/components/bottom-navigation";

// (Demais funções utilitárias como parsePollMetadata, parsePollOption, etc. permanecem idênticas ao anterior.)

// ... Use exatamente o corpo da função UsuariosPageContent como estava no seu exemplo ...

export default function UsuariosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0F172A]" />}>
      <UsuariosPageContent />
    </Suspense>
  );
}
