import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Layers, 
  Cpu, 
  Zap,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionProgressCard } from './SessionProgressCard';

interface MultiSessionManagerProps {
  onSessionSelect?: (sessionId: string) => void;
  onScreenshotRequest?: (sessionId: string, imageUrl: string, profileName: string) => void;
  maxConcurrent?: number;
}

interface ActiveSession {
  id: string;
  status: string;
  progress: number;
  current_step: number;
  total_steps: number;
  runner_id?: string;
  profiles?: { name: string } | null;
  current_action?: string;
  last_screenshot_url?: string;
  task_id?: string;
}

const MAX_CONCURRENT_SESSIONS = 10;

export function MultiSessionManager({ 
  onSessionSelect, 
  onScreenshotRequest,
  maxConcurrent = MAX_CONCURRENT_SESSIONS 
}: MultiSessionManagerProps) {
  const [resourceUsage, setResourceUsage] = useState({
    cpuEstimate: 0,
    memoryEstimate: 0,
  });

  // Fetch active sessions
  const { data: sessions = [], refetch } = useQuery({
    queryKey: ['multi-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          status,
          progress,
          current_step,
          total_steps,
          runner_id,
          last_screenshot_url,
          task_id,
          metadata,
          profiles ( name )
        `)
        .in('status', ['running', 'queued', 'paused'])
        .order('updated_at', { ascending: false })
        .limit(maxConcurrent);

      if (error) throw error;

      return (data || []).map(s => ({
        ...s,
        current_action: (s.metadata as any)?.current_action,
      })) as ActiveSession[];
    },
    refetchInterval: 2000,
  });

  // Fetch runner health for resource estimation
  const { data: runners = [] } = useQuery({
    queryKey: ['runner-resources'],
    queryFn: async () => {
      const { data } = await supabase
        .from('runner_health')
        .select('*')
        .order('last_heartbeat', { ascending: false });
      return data || [];
    },
    refetchInterval: 10000,
  });

  // Estimate resource usage
  useEffect(() => {
    const runningSessions = sessions.filter(s => s.status === 'running').length;
    // Rough estimates: ~15% CPU and ~200MB RAM per session
    setResourceUsage({
      cpuEstimate: Math.min(100, runningSessions * 15),
      memoryEstimate: runningSessions * 200,
    });
  }, [sessions]);

  const runningSessions = sessions.filter(s => s.status === 'running');
  const queuedSessions = sessions.filter(s => s.status === 'queued');
  const pausedSessions = sessions.filter(s => s.status === 'paused');

  const canAddMore = sessions.length < maxConcurrent;
  const utilizationPercent = (sessions.length / maxConcurrent) * 100;

  const handleScreenshotClick = (session: ActiveSession) => {
    if (session.last_screenshot_url && onScreenshotRequest) {
      onScreenshotRequest(
        session.id, 
        session.last_screenshot_url, 
        session.profiles?.name || 'Agent'
      );
    }
    onSessionSelect?.(session.id);
  };

  return (
    <div className="space-y-4">
      {/* Resource Usage Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Потоки</span>
          <Badge variant="outline" className="text-[10px] h-5">
            {runningSessions.length}/{maxConcurrent}
          </Badge>
        </div>
        
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            ~{resourceUsage.cpuEstimate}% CPU
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            ~{resourceUsage.memoryEstimate}MB
          </span>
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Загрузка</span>
          <span className={cn(
            "font-mono",
            utilizationPercent > 80 ? "text-amber-500" : 
            utilizationPercent > 60 ? "text-primary" : "text-muted-foreground"
          )}>
            {Math.round(utilizationPercent)}%
          </span>
        </div>
        <Progress 
          value={utilizationPercent} 
          className={cn(
            "h-1.5",
            utilizationPercent > 80 && "[&>div]:bg-amber-500"
          )} 
        />
      </div>

      {/* Session Status Summary */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-3 text-xs">
          {runningSessions.length > 0 && (
            <div className="flex items-center gap-1.5 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{runningSessions.length} активных</span>
            </div>
          )}
          {queuedSessions.length > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span>{queuedSessions.length} в очереди</span>
            </div>
          )}
          {pausedSessions.length > 0 && (
            <div className="flex items-center gap-1.5 text-amber-500">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>{pausedSessions.length} пауза</span>
            </div>
          )}
        </div>
      )}

      {/* Session Cards */}
      <div className="space-y-2">
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Нет активных сессий</p>
            <p className="text-xs opacity-60">Начните новую задачу</p>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionProgressCard
              key={session.id}
              session={session}
              onScreenshotClick={() => handleScreenshotClick(session)}
              compact={sessions.length > 3}
            />
          ))
        )}
      </div>

      {/* Capacity Warning */}
      {!canAddMore && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Достигнут лимит параллельных сессий ({maxConcurrent})</span>
        </div>
      )}

      {/* Recommendations */}
      {resourceUsage.cpuEstimate > 70 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-xs text-muted-foreground">
          <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Высокая нагрузка. Рекомендуется не добавлять новые сессии.</span>
        </div>
      )}
    </div>
  );
}
