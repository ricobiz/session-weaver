import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Database,
  Server,
  Globe,
  Cpu,
  HardDrive,
  Wifi,
  Clock
} from 'lucide-react';

interface DiagnosticResult {
  component: string;
  check_type: string;
  status: 'ok' | 'warning' | 'error';
  message?: string;
  response_time_ms?: number;
  details?: Record<string, unknown>;
}

interface ComponentCheck {
  name: string;
  icon: React.ReactNode;
  checks: {
    type: string;
    label: string;
    check: () => Promise<DiagnosticResult>;
  }[];
}

export function SystemDiagnostics() {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<DiagnosticResult[]>([]);

  const { data: lastDiagnostics = [] } = useQuery({
    queryKey: ['system-diagnostics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_diagnostics')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: proxies = [] } = useQuery({
    queryKey: ['proxies'],
    queryFn: async () => {
      const { data } = await supabase.from('proxies').select('id, status');
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id');
      return data || [];
    },
  });

  const { data: runners = [] } = useQuery({
    queryKey: ['runner-health'],
    queryFn: async () => {
      const { data } = await supabase
        .from('runner_health')
        .select('*')
        .gte('last_heartbeat', new Date(Date.now() - 60000).toISOString());
      return data || [];
    },
  });

  const componentChecks: ComponentCheck[] = [
    {
      name: 'Database',
      icon: <Database className="w-4 h-4" />,
      checks: [
        {
          type: 'connection',
          label: 'Connection',
          check: async () => {
            const start = Date.now();
            try {
              const { error } = await supabase.from('profiles').select('id').limit(1);
              const responseTime = Date.now() - start;
              if (error) throw error;
              return {
                component: 'database',
                check_type: 'connection',
                status: 'ok' as const,
                message: 'Database connection successful',
                response_time_ms: responseTime,
              };
            } catch {
              return {
                component: 'database',
                check_type: 'connection',
                status: 'error' as const,
                message: 'Database connection failed',
                response_time_ms: Date.now() - start,
              };
            }
          },
        },
        {
          type: 'tables',
          label: 'Tables',
          check: async () => {
            const tables = ['profiles', 'sessions', 'scenarios', 'proxies', 'tasks'];
            const missing: string[] = [];
            
            for (const table of tables) {
              try {
                const { error } = await supabase.from(table as any).select('id').limit(1);
                if (error) missing.push(table);
              } catch {
                missing.push(table);
              }
            }
            
            return {
              component: 'database',
              check_type: 'tables',
              status: missing.length === 0 ? 'ok' as const : 'error' as const,
              message: missing.length === 0 
                ? `All ${tables.length} tables accessible` 
                : `Missing tables: ${missing.join(', ')}`,
              details: { tables, missing },
            };
          },
        },
      ],
    },
    {
      name: 'Runners',
      icon: <Server className="w-4 h-4" />,
      checks: [
        {
          type: 'availability',
          label: 'Availability',
          check: async () => {
            return {
              component: 'runners',
              check_type: 'availability',
              status: runners.length > 0 ? 'ok' as const : 'warning' as const,
              message: runners.length > 0 
                ? `${runners.length} runner(s) online` 
                : 'No runners online',
              details: { count: runners.length },
            };
          },
        },
      ],
    },
    {
      name: 'Proxies',
      icon: <Globe className="w-4 h-4" />,
      checks: [
        {
          type: 'availability',
          label: 'Availability',
          check: async () => {
            const active = proxies.filter((p: any) => p.status === 'active').length;
            const total = proxies.length;
            
            return {
              component: 'proxies',
              check_type: 'availability',
              status: active > 0 ? 'ok' as const : total > 0 ? 'warning' as const : 'warning' as const,
              message: total === 0 
                ? 'No proxies configured' 
                : `${active}/${total} proxies active`,
              details: { active, total },
            };
          },
        },
      ],
    },
    {
      name: 'Profiles',
      icon: <Cpu className="w-4 h-4" />,
      checks: [
        {
          type: 'count',
          label: 'Count',
          check: async () => {
            return {
              component: 'profiles',
              check_type: 'count',
              status: profiles.length > 0 ? 'ok' as const : 'warning' as const,
              message: profiles.length > 0 
                ? `${profiles.length} profile(s) configured` 
                : 'No profiles configured',
              details: { count: profiles.length },
            };
          },
        },
      ],
    },
    {
      name: 'API',
      icon: <Wifi className="w-4 h-4" />,
      checks: [
        {
          type: 'edge_functions',
          label: 'Edge Functions',
          check: async () => {
            const start = Date.now();
            try {
              const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/health`,
                {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  },
                }
              );
              const responseTime = Date.now() - start;
              
              return {
                component: 'api',
                check_type: 'edge_functions',
                status: response.ok ? 'ok' as const : 'warning' as const,
                message: response.ok ? 'Edge functions responding' : 'Edge functions may have issues',
                response_time_ms: responseTime,
              };
            } catch {
              return {
                component: 'api',
                check_type: 'edge_functions',
                status: 'warning' as const,
                message: 'Edge functions not reachable (may be normal if not deployed)',
                response_time_ms: Date.now() - start,
              };
            }
          },
        },
      ],
    },
  ];

  const runDiagnostics = async () => {
    setIsRunning(true);
    setProgress(0);
    setResults([]);
    
    const allChecks = componentChecks.flatMap(c => c.checks);
    const newResults: DiagnosticResult[] = [];
    
    for (let i = 0; i < allChecks.length; i++) {
      const check = allChecks[i];
      try {
        const result = await check.check();
        newResults.push(result);
        
        // Save to database
        await supabase.from('system_diagnostics').insert([{
          component: result.component,
          check_type: result.check_type,
          status: result.status,
          message: result.message,
          response_time_ms: result.response_time_ms,
          details: JSON.parse(JSON.stringify(result.details || {})),
        }]);
      } catch (error) {
        newResults.push({
          component: check.type,
          check_type: check.type,
          status: 'error',
          message: `Check failed: ${error}`,
        });
      }
      
      setProgress(((i + 1) / allChecks.length) * 100);
      setResults([...newResults]);
    }
    
    queryClient.invalidateQueries({ queryKey: ['system-diagnostics'] });
    setIsRunning(false);
    
    const errors = newResults.filter(r => r.status === 'error').length;
    const warnings = newResults.filter(r => r.status === 'warning').length;
    
    toast({
      title: 'Diagnostics Complete',
      description: errors > 0 
        ? `${errors} error(s), ${warnings} warning(s) found` 
        : warnings > 0 
          ? `${warnings} warning(s) found` 
          : 'All systems operational',
      variant: errors > 0 ? 'destructive' : 'default',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ok: 'bg-green-500/20 text-green-400',
      warning: 'bg-yellow-500/20 text-yellow-400',
      error: 'bg-red-500/20 text-red-400',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  const overallHealth = results.length > 0 
    ? results.every(r => r.status === 'ok') 
      ? 'healthy' 
      : results.some(r => r.status === 'error') 
        ? 'critical' 
        : 'degraded'
    : 'unknown';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5" />
          System Diagnostics
        </h2>
        <div className="flex items-center gap-2">
          {overallHealth !== 'unknown' && (
            <Badge className={
              overallHealth === 'healthy' ? 'bg-green-500/20 text-green-400' :
              overallHealth === 'critical' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }>
              {overallHealth.charAt(0).toUpperCase() + overallHealth.slice(1)}
            </Badge>
          )}
          <Button size="sm" onClick={runDiagnostics} disabled={isRunning}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isRunning ? 'animate-spin' : ''}`} />
            Run Diagnostics
          </Button>
        </div>
      </div>

      {isRunning && (
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Running diagnostics...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <div className="grid gap-3">
          {componentChecks.map((component) => {
            const componentResults = results.filter(r => r.component === component.name.toLowerCase());
            if (componentResults.length === 0) return null;

            return (
              <Card key={component.name} className="bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-muted">
                      {component.icon}
                    </div>
                    <span className="font-medium">{component.name}</span>
                  </div>
                  <div className="space-y-2">
                    {componentResults.map((result, i) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          <span>{result.check_type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {result.response_time_ms && (
                            <span className="text-xs text-muted-foreground">
                              {result.response_time_ms}ms
                            </span>
                          )}
                          <Badge className={getStatusBadge(result.status)}>
                            {result.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  {componentResults[0]?.message && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {componentResults[0].message}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {results.length === 0 && !isRunning && (
        <Card className="bg-muted/30">
          <CardContent className="py-8 text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No diagnostics run yet</p>
            <Button onClick={runDiagnostics}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Run System Check
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
