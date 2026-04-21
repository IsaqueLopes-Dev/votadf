type CategoryIconProps = {
  category: string;
  className?: string;
};

export default function CategoryIcon({ category, className = 'h-5 w-5' }: CategoryIconProps) {
  switch (category) {
    case 'politica':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 10V7.5L12 4l6 3.5V10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10v7M12 10v7M17 10v7M4 17h16M3 20h18" />
        </svg>
      );
    case 'entretenimento':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 5h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.5v5l5-2.5-5-2.5z" />
        </svg>
      );
    case 'esportes':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 5.5l7 13" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 5.5l-7 13" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 9.5l15 5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 9.5l-15 5" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case 'financeiro':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 18h16" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 15l3-3 3 2 4-6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2v2" />
        </svg>
      );
    case 'celebridades':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.9 4.7 5.1.4-3.9 3.3 1.2 5-4.3-2.7-4.3 2.7 1.2-5L5 8.1l5.1-.4L12 3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 16.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5z" />
        </svg>
      );
    case 'criptomoedas':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 8h3a2 2 0 010 4h-3h3.5a2.25 2.25 0 010 4.5H10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
  }
}
