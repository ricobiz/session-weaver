import { SessionExecution } from '@/types/session';
import { StatusIndicator } from './StatusIndicator';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, User, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionCardProps {
  session: SessionExecution & {
    error_message?: string | null;
    last_successful_step?: number | null;
  };
  isSelected?: boolean;
  onClick?: () => void;
  onDelete?: (sessionId: string) => void;
}

export function SessionCard({ session, isSelected, onClick, onDelete }: SessionCardProps) {
  const isFailed = session.status === 'error';
  const isSuccess = session.status === 'success';
  const isComplete = isFailed || isSuccess;
  const canDelete = session.status !== 'running';

  return (
    <div
      onClick={onClick}
      className={cn(
        'glass-panel rounded-lg p-3 cursor-pointer transition-all duration-200',
        'hover:border-primary/50',
        isSelected && 'card-glow border-primary/50',
        isFailed && 'border-red-500/30',
        isSuccess && 'border-green-500/30'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusIndicator status={session.status} size="lg" />
          <span className="font-medium text-sm truncate max-w-[120px]">{session.scenarioName}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground font-mono">
            {session.id.slice(-6)}
          </span>
          {onDelete && canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(session.id);
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="w-2.5 h-2.5" />
            <span>{session.profileName}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            <span>{session.startTime?.split('T')[1]?.slice(0, 5) || '--:--'}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">
              Step {session.currentStep}/{session.totalSteps}
            </span>
            <span className="font-mono text-primary">{session.progress}%</span>
          </div>
          <Progress value={session.progress} className="h-1" />
        </div>

        {/* Outcome for completed sessions */}
        {isComplete && (
          <div className={cn(
            'p-1.5 rounded text-[10px]',
            isSuccess ? 'bg-green-500/10' : 'bg-red-500/10'
          )}>
            <div className="flex items-center gap-1.5">
              {isSuccess ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  <span className="text-green-400 font-medium">Goal Achieved</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span className="text-red-400 font-medium">Failed</span>
                  {session.last_successful_step !== null && session.last_successful_step !== undefined && (
                    <span className="text-muted-foreground ml-auto">
                      Last OK: step {session.last_successful_step + 1}
                    </span>
                  )}
                </>
              )}
            </div>
            {isFailed && session.error_message && (
              <p className="text-muted-foreground mt-1 truncate" title={session.error_message}>
                {session.error_message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
