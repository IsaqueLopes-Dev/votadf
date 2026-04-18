'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef } from 'react';

type CategoryOption = {
  value: string;
  label: string;
};

type CategoryCarouselProps = {
  categories: CategoryOption[];
  selectedCategory: string;
  onCategoryChange?: (value: string) => void;
  basePath?: string;
  variant?: 'light' | 'dark';
};

const getCategoryIcon = (value: string): ReactNode => {
  switch (value) {
    case 'politica':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 10V7.5L12 4l6 3.5V10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10v7M12 10v7M17 10v7M4 17h16M3 20h18" />
        </svg>
      );
    case 'entretenimento':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 5h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.5v5l5-2.5-5-2.5z" />
        </svg>
      );
    case 'esportes':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 5.5l7 13" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 5.5l-7 13" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 9.5l15 5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 9.5l-15 5" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case 'financeiro':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 18h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 15l3-3 3 2 4-6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2v2" />
        </svg>
      );
    case 'celebridades':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.9 4.7 5.1.4-3.9 3.3 1.2 5-4.3-2.7-4.3 2.7 1.2-5L5 8.1l5.1-.4L12 3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 16.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5z" />
        </svg>
      );
    case 'criptomoedas':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 8h3a2 2 0 010 4h-3h3.5a2.25 2.25 0 010 4.5H10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12" />
        </svg>
      );
    case 'todos':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
  }
};

export default function CategoryCarousel({
  categories,
  selectedCategory,
  onCategoryChange,
  basePath = '/',
  variant = 'light',
}: CategoryCarouselProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      container.scrollLeft += event.deltaY;
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="-mx-1 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max gap-3 px-1">
        {categories.map((category) => (
          <Link
            key={category.value}
            href={category.value === 'todos' ? basePath : `${basePath}?category=${category.value}`}
            onClick={(event) => {
              if (!onCategoryChange) return;
              event.preventDefault();
              onCategoryChange(category.value);
            }}
            className={`group min-w-[132px] shrink-0 rounded-2xl border px-4 py-3 text-left transition sm:min-w-[148px] ${
              variant === 'dark'
                ? selectedCategory === category.value
                  ? 'border-cyan-400 bg-blue-600 text-white shadow-lg shadow-blue-950/40'
                  : 'border-cyan-900/80 bg-slate-950/75 text-cyan-100 hover:border-cyan-500 hover:bg-slate-900/90'
                : selectedCategory === category.value
                  ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
            }`}
          >
            <div
              className={`mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
                selectedCategory === category.value
                  ? 'border-white/30 bg-white/15'
                  : variant === 'dark'
                    ? 'border-cyan-800/80 bg-cyan-950/60'
                    : 'border-slate-200 bg-slate-50'
              }`}
            >
              {getCategoryIcon(category.value)}
            </div>
            <p
              className={`text-sm font-semibold leading-tight ${
                selectedCategory === category.value
                  ? 'text-white'
                  : variant === 'dark'
                    ? 'text-cyan-100'
                    : 'text-slate-900'
              }`}
            >
              {category.label}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
