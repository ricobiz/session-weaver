import { Link } from 'react-router-dom';
import { Activity, Zap, Wifi, WifiOff, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RunnerHealth {
  id: string;
  runner_id: string;
  last_heartbeat: string;
  active_sessions: number;
}

export function Header() {
  // Fetch runner health for system status
  const { data: runners = [] } = useQuery({
    queryKey: ['header-runners'],
    queryFn: async () => {
      const { data } = await supabase
        .from('runner_health')
        .select('*')
        .order('last_heartbeat', { ascending: false });
      return (data || []) as RunnerHealth[];
    },
    refetchInterval: 10000,
  });

  const onlineRunners = runners.filter(r => {
    const lastBeat = new Date(r.last_heartbeat).getTime();
    return Date.now() - lastBeat < 30000;
  });
  const systemOnline = onlineRunners.length > 0;

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between gap-2 overflow-hidden">
        {/* Left side - Logo */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
          </div>
          <div className="min-w-0 hidden xs:block">
            <h1 className="font-semibold text-xs sm:text-sm truncate">Developer</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate hidden sm:block">Full System</p>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Operator Mode Link */}
          <Button 
            variant="outline" 
            size="sm" 
            asChild 
            className="h-7 px-2 rounded-lg border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-medium"
          >
            <Link to="/">
              <Zap className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Operator</span>
            </Link>
          </Button>

          {/* System Status */}
          <div className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium flex-shrink-0 ${
            systemOnline 
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
              : 'bg-destructive/10 text-destructive border border-destructive/20'
          }`}>
            {systemOnline ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                <span className="hidden xs:inline">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 flex-shrink-0" />
                <span className="hidden xs:inline">Offline</span>
              </>
            )}
          </div>

          {/* Workers count - only on larger screens */}
          {onlineRunners.length > 0 && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 text-[10px] text-muted-foreground">
              <Server className="w-3 h-3" />
              <span>{onlineRunners.length}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
