import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    positive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
}

const variantClasses = {
  default: 'text-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
};

const iconVariantClasses = {
  default: 'text-muted-foreground',
  primary: 'text-primary/70',
  success: 'text-success/70',
  warning: 'text-warning/70',
  error: 'text-destructive/70',
};

export function StatCard({ title, value, icon: Icon, trend, variant = 'default' }: StatCardProps) {
  return (
    <div className="glass-panel rounded-lg p-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            {title}
          </p>
          <p className={cn('text-2xl font-semibold font-mono', variantClasses[variant])}>
            {value}
          </p>
          {trend && (
            <p className={cn(
              'text-xs mt-1',
              trend.positive ? 'text-success' : 'text-destructive'
            )}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className={cn('p-2 rounded-md bg-muted/50', iconVariantClasses[variant])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
