import { useState, useEffect } from 'react';
import { Activity, Wallet, Cpu, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SystemStatus {
  openRouterBalance: number | null;
  activeTasks: number;
  activeSessions: number;
  runnerHealth: 'OK' | 'DEGRADED' | 'OFFLINE';
  runnersOnline: number;
  runnersTotal: number;
}

export function SystemStatusBanner() {
  const [status, setStatus] = useState<SystemStatus>({
    openRouterBalance: null,
    activeTasks: 0,
    activeSessions: 0,
    runnerHealth: 'OFFLINE',
    runnersOnline: 0,
    runnersTotal: 0,
  });

  useEffect(() => {
    const fetchStatus = async () => {
      // Fetch all status in parallel
      const [balanceRes, tasksRes, sessionsRes, runnersRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/balance`).then(r => r.json()).catch(() => null),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'running'),
        supabase.from('runner_health').select('*'),
      ]);

      const now = Date.now();
      const runners = runnersRes.data || [];
      const onlineRunners = runners.filter(r => 
        now - new Date(r.last_heartbeat).getTime() < 120000
      );

      let runnerHealth: 'OK' | 'DEGRADED' | 'OFFLINE' = 'OFFLINE';
      if (onlineRunners.length === runners.length && runners.length > 0) {
        runnerHealth = 'OK';
      } else if (onlineRunners.length > 0) {
        runnerHealth = 'DEGRADED';
      }

      setStatus({
        openRouterBalance: balanceRes?.credits != null ? (balanceRes.credits - (balanceRes.credits_used || 0)) : null,
        activeTasks: tasksRes.count || 0,
        activeSessions: sessionsRes.count || 0,
        runnerHealth,
        runnersOnline: onlineRunners.length,
        runnersTotal: runners.length,
      });
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const getHealthIcon = () => {
    switch (status.runnerHealth) {
      case 'OK': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'DEGRADED': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'OFFLINE': return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getHealthColor = () => {
    switch (status.runnerHealth) {
      case 'OK': return 'text-green-500';
      case 'DEGRADED': return 'text-yellow-500';
      case 'OFFLINE': return 'text-red-500';
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-muted/30 border-b border-border/50 text-sm">
      <div className="flex flex-wrap items-center gap-4 md:gap-6">
        {/* OpenRouter Balance */}
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Balance:</span>
          <span className={`font-mono font-medium ${
            status.openRouterBalance !== null && status.openRouterBalance < 1 
              ? 'text-destructive' 
              : 'text-foreground'
          }`}>
            {status.openRouterBalance !== null 
              ? `$${status.openRouterBalance.toFixed(2)}` 
              : '—'}
          </span>
        </div>

        {/* Active Tasks */}
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-muted-foreground">Tasks:</span>
          <span className="font-medium">{status.activeTasks}</span>
        </div>

        {/* Active Sessions */}
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-500 shrink-0" />
          <span className="text-muted-foreground">Sessions:</span>
          <span className="font-medium">{status.activeSessions}</span>
        </div>
      </div>

      {/* Runner Health */}
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Runners:</span>
        {getHealthIcon()}
        <span className={`font-medium ${getHealthColor()}`}>
          {status.runnerHealth}
        </span>
        <span className="text-muted-foreground text-xs">
          ({status.runnersOnline}/{status.runnersTotal})
        </span>
      </div>
    </div>
  );
}
