import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, AlertTriangle, Pause, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionProgressCardProps {
  session: {
    id: string;
    status: string;
    progress: number;
    current_step: number;
    total_steps: number;
    profiles?: { name: string } | null;
    current_action?: string;
    last_screenshot_url?: string;
  };
  onScreenshotClick?: () => void;
  compact?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  open: 'Открывает страницу',
  play: 'Воспроизводит',
  scroll: 'Прокручивает',
  click: 'Нажимает',
  like: 'Ставит лайк',
  comment: 'Комментирует',
  wait: 'Ожидает',
  screenshot: 'Делает скриншот',
  navigate: 'Переходит',
  type: 'Вводит текст',
};

export function SessionProgressCard({ session, onScreenshotClick, compact }: SessionProgressCardProps) {
  const isRunning = session.status === 'running';
  const isSuccess = session.status === 'success';
  const isError = session.status === 'error';
  const isPaused = session.status === 'paused';

  const statusColor = isRunning ? 'bg-primary' : 
                      isSuccess ? 'bg-emerald-500' : 
                      isError ? 'bg-destructive' : 
                      isPaused ? 'bg-amber-500' : 'bg-muted-foreground';

  const actionLabel = ACTION_LABELS[session.current_action || ''] || 'Обрабатывает...';

  if (compact) {
    return (
      <div 
        onClick={onScreenshotClick}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all",
          "bg-card/80 border border-border/50 hover:border-primary/50 hover:shadow-sm"
        )}
      >
        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", statusColor, isRunning && "animate-pulse")} />
        <span className="text-xs font-medium truncate max-w-[80px]">
          {session.profiles?.name || 'Agent'}
        </span>
        <div className="flex-1 min-w-0">
          <Progress value={session.progress} className="h-1" />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {session.progress}%
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card/80 border border-border/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full", statusColor, isRunning && "animate-pulse")} />
          <span className="font-medium text-sm">
            {session.profiles?.name || 'Agent'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
          {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          {isError && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
          {isPaused && <Pause className="w-3.5 h-3.5 text-amber-500" />}
        </div>
      </div>

      {/* Status Text */}
      <div className="text-xs text-muted-foreground">
        {isRunning ? actionLabel : 
         isSuccess ? 'Завершено успешно' :
         isError ? 'Ошибка выполнения' :
         isPaused ? 'Приостановлено' : 'Ожидает'}
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <Progress value={session.progress} className="h-1.5" />
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">
            Шаг {session.current_step} из {session.total_steps}
          </span>
          <span className="font-mono font-medium">{session.progress}%</span>
        </div>
      </div>

      {/* Screenshot Preview (if available) */}
      {session.last_screenshot_url && (
        <div 
          onClick={onScreenshotClick}
          className="relative rounded-lg overflow-hidden cursor-pointer group"
        >
          <img 
            src={session.last_screenshot_url} 
            alt="Preview" 
            className="w-full h-24 object-cover opacity-60 group-hover:opacity-100 transition-opacity"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 group-hover:bg-transparent transition-colors">
            <Camera className="w-5 h-5 text-foreground/60 group-hover:scale-110 transition-transform" />
          </div>
        </div>
      )}
    </div>
  );
}
