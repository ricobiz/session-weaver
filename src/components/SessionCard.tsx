import { SessionExecution } from '@/types/session';
import { StatusIndicator } from './StatusIndicator';
import { Progress } from '@/components/ui/progress';
import { Clock, User, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionCardProps {
  session: SessionExecution;
  isSelected?: boolean;
  onClick?: () => void;
}

export function SessionCard({ session, isSelected, onClick }: SessionCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'glass-panel rounded-lg p-4 cursor-pointer transition-all duration-200 animate-slide-in',
        'hover:border-primary/50',
        isSelected && 'card-glow border-primary/50'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusIndicator status={session.status} size="lg" />
          <span className="font-medium text-sm">{session.scenarioName}</span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {session.id.slice(-6)}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>{session.profileName}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{session.startTime.split('T')[1].slice(0, 5)}</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              Step {session.currentStep}/{session.totalSteps}
            </span>
            <span className="font-mono text-primary">{session.progress}%</span>
          </div>
          <Progress value={session.progress} className="h-1.5" />
        </div>
      </div>
    </div>
  );
}
