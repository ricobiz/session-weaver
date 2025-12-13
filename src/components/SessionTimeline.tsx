import { useMemo } from 'react';
import { Database } from '@/integrations/supabase/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Clock, CheckCircle2, XCircle, Play, Loader2 } from 'lucide-react';

type SessionLog = Database['public']['Tables']['session_logs']['Row'];

interface SessionTimelineProps {
  logs: SessionLog[];
  totalSteps: number;
  currentStep: number;
  className?: string;
}

interface StepData {
  index: number;
  action: string;
  status: 'pending' | 'running' | 'success' | 'error';
  durationMs?: number;
  message?: string;
}

export function SessionTimeline({ logs, totalSteps, currentStep, className }: SessionTimelineProps) {
  const steps = useMemo(() => {
    const stepMap = new Map<number, StepData>();

    // Initialize all steps as pending
    for (let i = 0; i < totalSteps; i++) {
      stepMap.set(i, {
        index: i,
        action: 'unknown',
        status: i < currentStep ? 'success' : i === currentStep ? 'running' : 'pending',
      });
    }

    // Process logs to get actual step data
    logs.forEach((log) => {
      if (log.step_index === null || log.step_index === undefined) return;

      const existing = stepMap.get(log.step_index) || {
        index: log.step_index,
        action: 'unknown',
        status: 'pending' as const,
      };

      if (log.action) {
        existing.action = log.action;
      }

      if (log.level === 'success') {
        existing.status = 'success';
      } else if (log.level === 'error') {
        existing.status = 'error';
        existing.message = log.message;
      }

      const details = log.details as Record<string, unknown> | null;
      if (details?.durationMs) {
        existing.durationMs = details.durationMs as number;
      }
      if (log.duration_ms) {
        existing.durationMs = log.duration_ms;
      }

      stepMap.set(log.step_index, existing);
    });

    return Array.from(stepMap.values()).sort((a, b) => a.index - b.index);
  }, [logs, totalSteps, currentStep]);

  const totalDuration = useMemo(() => {
    return steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  }, [steps]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const getMaxDuration = () => {
    return Math.max(...steps.map(s => s.durationMs || 0), 1);
  };

  return (
    <div className={cn('glass-panel rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Execution Timeline
        </h3>
        {totalDuration > 0 && (
          <span className="text-xs text-muted-foreground">
            Total: {formatDuration(totalDuration)}
          </span>
        )}
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-2">
          {steps.map((step) => {
            const widthPercent = step.durationMs 
              ? Math.max((step.durationMs / getMaxDuration()) * 100, 10)
              : 10;

            return (
              <div key={step.index} className="flex items-center gap-3">
                {/* Step number */}
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono bg-muted shrink-0">
                  {step.index + 1}
                </div>

                {/* Status icon */}
                <div className="shrink-0">
                  {step.status === 'success' && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  {step.status === 'error' && (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  {step.status === 'running' && (
                    <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                  )}
                  {step.status === 'pending' && (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                </div>

                {/* Action name */}
                <div className="w-20 shrink-0">
                  <span className="text-xs font-mono text-muted-foreground">
                    {step.action}
                  </span>
                </div>

                {/* Duration bar */}
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden relative">
                  <div
                    className={cn(
                      'h-full rounded transition-all duration-300',
                      step.status === 'success' && 'bg-green-500/30',
                      step.status === 'error' && 'bg-red-500/30',
                      step.status === 'running' && 'bg-amber-500/30 animate-pulse',
                      step.status === 'pending' && 'bg-muted/50'
                    )}
                    style={{ width: `${widthPercent}%` }}
                  />
                  {step.durationMs && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {formatDuration(step.durationMs)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {steps.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <Play className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No execution data</p>
              <p className="text-xs">Select a session to view timeline</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
