'use client';

import Link from 'next/link';
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
};

export default function CategoryCarousel({
  categories,
  selectedCategory,
  onCategoryChange,
  basePath = '/',
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
            className={`group min-w-[148px] shrink-0 rounded-2xl border px-4 py-4 text-left transition sm:min-w-[170px] ${
              selectedCategory === category.value
                ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100'
                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
            }`}
          >
            <p className={`text-sm font-semibold ${selectedCategory === category.value ? 'text-white' : 'text-slate-900'}`}>
              {category.label}
            </p>
            <p
              className={`mt-1 text-xs leading-5 ${
                selectedCategory === category.value ? 'text-blue-100' : 'text-slate-500'
              }`}
            >
              {category.value === 'todos'
                ? 'Veja todas as votações disponíveis.'
                : `Explore votações de ${category.label.toLowerCase()}.`}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}