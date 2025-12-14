import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, Activity, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RunnerHealth {
  id: string;
  runner_id: string;
  last_heartbeat: string;
  active_sessions: number;
  total_sessions_executed: number;
  total_failures: number;
  uptime_seconds: number;
}

interface RunnerStatusProps {
  refreshInterval?: number;
  onRunnerDisconnect?: (runnerId: string) => void;
}

export function RunnerStatus({ 
  refreshInterval = 15000,
  onRunnerDisconnect 
}: RunnerStatusProps) {
  const [runners, setRunners] = useState<RunnerHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRunners = async () => {
    const { data } = await supabase
      .from('runner_health')
      .select('*')
      .order('last_heartbeat', { ascending: false });
    
    if (data) {
      setRunners(data);
      
      // Check for disconnected runners (no heartbeat in 2 minutes)
      const now = Date.now();
      data.forEach(runner => {
        const lastHeartbeat = new Date(runner.last_heartbeat).getTime();
        const timeSinceHeartbeat = now - lastHeartbeat;
        
        if (timeSinceHeartbeat > 120000 && runner.active_sessions > 0 && onRunnerDisconnect) {
          onRunnerDisconnect(runner.runner_id);
        }
      });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchRunners();
    const interval = setInterval(fetchRunners, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const getRunnerStatus = (lastHeartbeat: string) => {
    const timeSince = Date.now() - new Date(lastHeartbeat).getTime();
    
    if (timeSince < 60000) return { status: 'online', color: 'success' };
    if (timeSince < 120000) return { status: 'stale', color: 'warning' };
    return { status: 'offline', color: 'destructive' };
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatLastSeen = (timestamp: string) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const totalActive = runners.reduce((sum, r) => sum + (r.active_sessions || 0), 0);
  const onlineCount = runners.filter(r => getRunnerStatus(r.last_heartbeat).status === 'online').length;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            Runners
          </span>
          <Badge variant={onlineCount > 0 ? 'default' : 'destructive'}>
            {onlineCount}/{runners.length} online
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : runners.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            <span>No runners connected</span>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground">Active Sessions</div>
                <div className="font-medium text-lg">{totalActive}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground">Total Executed</div>
                <div className="font-medium text-lg">
                  {runners.reduce((sum, r) => sum + (r.total_sessions_executed || 0), 0)}
                </div>
              </div>
            </div>

            {/* Runner List */}
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {runners.map(runner => {
                const { status, color } = getRunnerStatus(runner.last_heartbeat);
                return (
                  <div 
                    key={runner.id}
                    className="flex items-center justify-between text-xs bg-muted/30 rounded p-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        color === 'success' ? 'bg-green-500' :
                        color === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span className="font-mono truncate max-w-[100px]" title={runner.runner_id}>
                        {runner.runner_id.slice(0, 12)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {runner.active_sessions || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatUptime(runner.uptime_seconds || 0)}
                      </span>
                      <span>{formatLastSeen(runner.last_heartbeat)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
