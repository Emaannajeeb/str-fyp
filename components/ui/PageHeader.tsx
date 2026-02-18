import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex-1">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
        {description && (
          <p className="mt-2 text-base text-gray-600 leading-relaxed">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 sm:ml-4">{action}</div>
      )}
    </div>
  );
}

