import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'red' | 'gray';
  trend?: {
    value: string;
    isPositive: boolean;
  };
  description?: string;
}

const iconColorClasses = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  purple: 'bg-purple-100 text-purple-600',
  orange: 'bg-orange-100 text-orange-600',
  red: 'bg-red-100 text-red-600',
  gray: 'bg-gray-100 text-gray-600',
};

export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = 'blue',
  trend,
  description,
}: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {trend && (
            <p
              className={`mt-1 text-xs font-medium ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </p>
          )}
          {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
        </div>
        <div className={`rounded-full p-3 ${iconColorClasses[iconColor]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

