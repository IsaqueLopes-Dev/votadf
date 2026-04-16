"use client";
import React from "react";

interface CategoryOption {
  value: string;
  label: string;
}

interface CategoryCarouselProps {
  categories: CategoryOption[];
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
}

const CategoryCarousel: React.FC<CategoryCarouselProps> = ({
  categories,
  selectedCategory,
  onCategoryChange,
}) => {
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {categories.map((cat) => (
        <button
          key={cat.value}
          className={`px-4 py-2 rounded-full text-sm font-semibold ${
            cat.value === selectedCategory
              ? "bg-indigo-600 text-white"
              : "bg-slate-700 text-slate-300"
          }`}
          onClick={() => onCategoryChange(cat.value)}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
};

export default CategoryCarousel;
