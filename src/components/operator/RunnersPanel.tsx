import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Server, Activity, AlertCircle, CheckCircle, Pause, Circle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

interface RunnerHealth {
  id: string;
  runner_id: string;
  last_heartbeat: string;
  active_sessions: number;
  total_sessions_executed: number | null;
  total_failures: number | null;
  uptime_seconds: number | null;
}

interface ActiveSession {
  id: string;
  status: string;
  progress: number;
  current_step: number;
  total_steps: number;
  runner_id?: string;
  profiles?: { name: string } | null;
}

type RunnerStatus = 'online' | 'busy' | 'idle' | 'warning' | 'offline';

export function RunnersPanel() {
  const { data: runners = [] } = useQuery({
    queryKey: ['runners-panel'],
    queryFn: async () => {
      const { data } = await supabase
        .from('runner_health')
        .select('*')
        .order('last_heartbeat', { ascending: false });
      return (data || []) as RunnerHealth[];
    },
    refetchInterval: 5000,
  });

  const { data: activeSessions = [] } = useQuery({
    queryKey: ['runner-sessions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sessions')
        .select('id, status, progress, current_step, total_steps, runner_id, profiles(name)')
        .in('status', ['running', 'queued', 'paused'])
        .order('created_at', { ascending: false });
      return (data || []) as ActiveSession[];
    },
    refetchInterval: 3000,
  });

  const getRunnerStatus = (runner: RunnerHealth): RunnerStatus => {
    const lastBeat = new Date(runner.last_heartbeat).getTime();
    const now = Date.now();
    
    if (now - lastBeat > 60000) return 'offline';
    if (now - lastBeat > 30000) return 'warning';
    if (runner.active_sessions > 0) return 'busy';
    return 'idle';
  };

  const getStatusColor = (status: RunnerStatus) => {
    switch (status) {
      case 'online': return 'bg-success';
      case 'busy': return 'bg-primary animate-pulse';
      case 'idle': return 'bg-success';
      case 'warning': return 'bg-warning';
      case 'offline': return 'bg-destructive';
    }
  };

  const getStatusLabel = (status: RunnerStatus) => {
    switch (status) {
      case 'online': return 'Online';
      case 'busy': return 'Working';
      case 'idle': return 'Idle';
      case 'warning': return 'Slow';
      case 'offline': return 'Offline';
    }
  };

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return '--';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getSessionStatus = (session: ActiveSession) => {
    switch (session.status) {
      case 'running': return { icon: Activity, color: 'text-primary', label: 'Running' };
      case 'queued': return { icon: Circle, color: 'text-muted-foreground', label: 'Queued' };
      case 'paused': return { icon: Pause, color: 'text-warning', label: 'Paused' };
      default: return { icon: Circle, color: 'text-muted-foreground', label: session.status };
    }
  };

  if (runners.length === 0 && activeSessions.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Нет активных раннеров</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {/* Runners List */}
        {runners.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              Раннеры ({runners.length})
            </h3>
            <div className="space-y-1.5">
              {runners.map(runner => {
                const status = getRunnerStatus(runner);
                const sessions = activeSessions.filter(s => s.runner_id === runner.runner_id);
                
                return (
                  <div 
                    key={runner.id}
                    className="p-2.5 rounded-lg bg-muted/30 border border-border/30 hover:border-border/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(status)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">
                            {runner.runner_id.slice(0, 8)}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            status === 'busy' ? 'bg-primary/20 text-primary' :
                            status === 'offline' ? 'bg-destructive/20 text-destructive' :
                            status === 'warning' ? 'bg-warning/20 text-warning' :
                            'bg-success/20 text-success'
                          }`}>
                            {getStatusLabel(status)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>Sessions: {runner.active_sessions}</span>
                          <span>Uptime: {formatUptime(runner.uptime_seconds)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Sessions for this runner */}
                    {sessions.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {sessions.map(session => {
                          const { icon: Icon, color } = getSessionStatus(session);
                          const progress = session.total_steps 
                            ? Math.round((session.current_step / session.total_steps) * 100)
                            : session.progress || 0;
                          
                          return (
                            <div 
                              key={session.id}
                              className="flex items-center gap-2 pl-4"
                            >
                              <Icon className={`w-3 h-3 flex-shrink-0 ${color}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-foreground/80 truncate">
                                    {session.profiles?.name || session.id.slice(0, 6)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">{progress}%</span>
                                </div>
                                <Progress value={progress} className="h-1 mt-0.5" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Orphan Sessions (no runner assigned) */}
        {activeSessions.filter(s => !s.runner_id).length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              В очереди
            </h3>
            <div className="space-y-1">
              {activeSessions.filter(s => !s.runner_id).map(session => {
                const { icon: Icon, color, label } = getSessionStatus(session);
                return (
                  <div 
                    key={session.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border/20"
                  >
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
                    <span className="text-xs text-foreground/80 truncate flex-1">
                      {session.profiles?.name || session.id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
