import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  Play,
  Square,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';

interface TaskProgress {
  id: string;
  name: string;
  status: string;
  sessions_created: number;
  sessions_completed: number;
  sessions_failed: number;
  started_at: string | null;
  // Computed
  active: number;
  queued: number;
  paused: number;
  progress_percent: number;
  eta_seconds: number | null;
}

interface TaskProgressPanelProps {
  refreshInterval?: number;
  onPauseTask?: (taskId: string) => void;
  onResumeTask?: (taskId: string) => void;
  onStopTask?: (taskId: string) => void;
}

export function TaskProgressPanel({
  refreshInterval = 3000,
  onPauseTask,
  onResumeTask,
  onStopTask,
}: TaskProgressPanelProps) {
  const [tasks, setTasks] = useState<TaskProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      // Get active tasks
      const { data: activeTasks } = await supabase
        .from('tasks')
        .select('*')
        .in('status', ['active', 'paused'])
        .order('started_at', { ascending: false });

      if (!activeTasks || activeTasks.length === 0) {
        setTasks([]);
        setIsLoading(false);
        return;
      }

      // Get session counts per task
      const taskIds = activeTasks.map(t => t.id);
      const { data: sessions } = await supabase
        .from('sessions')
        .select('task_id, status')
        .in('task_id', taskIds);

      // Aggregate session counts
      const sessionCounts: Record<string, Record<string, number>> = {};
      for (const session of sessions || []) {
        if (!session.task_id) continue;
        if (!sessionCounts[session.task_id]) {
          sessionCounts[session.task_id] = {
            running: 0,
            queued: 0,
            paused: 0,
            success: 0,
            error: 0,
            cancelled: 0,
          };
        }
        sessionCounts[session.task_id][session.status] = 
          (sessionCounts[session.task_id][session.status] || 0) + 1;
      }

      // Build task progress data
      const taskProgress: TaskProgress[] = activeTasks.map(task => {
        const counts = sessionCounts[task.id] || {};
        const total = task.sessions_created || 0;
        const completed = (counts.success || 0);
        const failed = (counts.error || 0);
        const active = (counts.running || 0);
        const queued = (counts.queued || 0);
        const paused = (counts.paused || 0);

        // Calculate progress
        const done = completed + failed;
        const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;

        // Estimate ETA based on completion rate
        let etaSeconds: number | null = null;
        if (task.started_at && active > 0 && done > 0) {
          const elapsedMs = Date.now() - new Date(task.started_at).getTime();
          const avgTimePerSession = elapsedMs / done;
          const remaining = total - done;
          etaSeconds = Math.round((remaining * avgTimePerSession) / 1000);
        }

        return {
          id: task.id,
          name: task.name,
          status: task.status,
          sessions_created: total,
          sessions_completed: completed,
          sessions_failed: failed,
          started_at: task.started_at,
          active,
          queued,
          paused,
          progress_percent: progressPercent,
          eta_seconds: etaSeconds,
        };
      });

      setTasks(taskProgress);
    } catch (error) {
      console.error('Error fetching task progress:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchTasks, refreshInterval]);

  const handlePause = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/pause`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      onPauseTask?.(taskId);
      await fetchTasks();
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/resume`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      onResumeTask?.(taskId);
      await fetchTasks();
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/stop`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      onStopTask?.(taskId);
      await fetchTasks();
    } finally {
      setActionLoading(null);
    }
  };

  const formatEta = (seconds: number | null): string => {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  const getStatusBadge = (task: TaskProgress) => {
    if (task.status === 'paused') {
      return <Badge variant="secondary" className="gap-1"><Pause className="h-3 w-3" />Paused</Badge>;
    }
    if (task.active > 0) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 gap-1"><Activity className="h-3 w-3 animate-pulse" />Running</Badge>;
    }
    if (task.queued > 0) {
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Queued</Badge>;
    }
    return <Badge variant="secondary">Idle</Badge>;
  };

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Active Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No active tasks. Use the command center to start one.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Active Tasks
          </span>
          <Badge variant="outline">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y divide-border/50">
            {tasks.map(task => {
              const isExpanded = expandedTaskId === task.id;
              const isActionLoading = actionLoading === task.id;

              return (
                <div key={task.id} className="p-3">
                  {/* Task Header */}
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{task.name}</span>
                        {getStatusBadge(task)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          {task.sessions_completed}
                        </span>
                        {task.sessions_failed > 0 && (
                          <span className="flex items-center gap-1">
                            <XCircle className="h-3 w-3 text-red-500" />
                            {task.sessions_failed}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3 text-yellow-500" />
                          {task.active}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {task.queued}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-mono font-medium">{task.progress_percent}%</div>
                        <div className="text-xs text-muted-foreground">
                          ETA: {formatEta(task.eta_seconds)}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2">
                    <Progress value={task.progress_percent} className="h-1.5" />
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                      {/* Session Breakdown */}
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div className="bg-muted/30 rounded p-2 text-center">
                          <div className="font-medium">{task.sessions_created}</div>
                          <div className="text-muted-foreground">Total</div>
                        </div>
                        <div className="bg-green-500/10 rounded p-2 text-center">
                          <div className="font-medium text-green-500">{task.sessions_completed}</div>
                          <div className="text-muted-foreground">Done</div>
                        </div>
                        <div className="bg-yellow-500/10 rounded p-2 text-center">
                          <div className="font-medium text-yellow-500">{task.active}</div>
                          <div className="text-muted-foreground">Active</div>
                        </div>
                        <div className="bg-red-500/10 rounded p-2 text-center">
                          <div className="font-medium text-red-500">{task.sessions_failed}</div>
                          <div className="text-muted-foreground">Failed</div>
                        </div>
                      </div>

                      {/* Failure Warning */}
                      {task.sessions_failed > 0 && task.sessions_failed / task.sessions_created > 0.2 && (
                        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                          <AlertTriangle className="h-3 w-3" />
                          <span>High failure rate ({Math.round(task.sessions_failed / task.sessions_created * 100)}%)</span>
                        </div>
                      )}

                      {/* Controls */}
                      <div className="flex gap-2">
                        {task.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1"
                            onClick={(e) => { e.stopPropagation(); handlePause(task.id); }}
                            disabled={isActionLoading}
                          >
                            {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                            Pause
                          </Button>
                        )}
                        {task.status === 'paused' && (
                          <Button
                            size="sm"
                            className="flex-1 gap-1"
                            onClick={(e) => { e.stopPropagation(); handleResume(task.id); }}
                            disabled={isActionLoading}
                          >
                            {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                            Resume
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1"
                          onClick={(e) => { e.stopPropagation(); handleStop(task.id); }}
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                          Stop
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
