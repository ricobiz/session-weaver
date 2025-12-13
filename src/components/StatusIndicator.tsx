import { cn } from '@/lib/utils';
import { SessionStatus } from '@/types/session';

interface StatusIndicatorProps {
  status: SessionStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<SessionStatus, { label: string; className: string }> = {
  idle: { label: 'Idle', className: 'status-dot-idle' },
  running: { label: 'Running', className: 'status-dot-warning animate-pulse-glow' },
  success: { label: 'Complete', className: 'status-dot-success' },
  error: { label: 'Failed', className: 'status-dot-error' },
  paused: { label: 'Paused', className: 'status-dot-idle' },
};

const sizeClasses = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
};

export function StatusIndicator({ status, showLabel = false, size = 'md' }: StatusIndicatorProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span className={cn('status-dot', config.className, sizeClasses[size])} />
      {showLabel && (
        <span className="text-sm text-muted-foreground">{config.label}</span>
      )}
    </div>
  );
}
