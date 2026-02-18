import { ReactNode } from 'react';

interface KPIGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5;
}

export function KPIGrid({ children, columns = 5 }: KPIGridProps) {
  const gridCols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5',
  };

  return (
    <div className={`mb-8 grid grid-cols-1 gap-6 ${gridCols[columns]}`}>{children}</div>
  );
}

