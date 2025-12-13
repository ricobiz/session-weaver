import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database } from '@/integrations/supabase/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Activity, TrendingUp, Server, AlertTriangle } from 'lucide-react';

type Session = Database['public']['Tables']['sessions']['Row'];
type Scenario = Database['public']['Tables']['scenarios']['Row'];

interface RunnerHealth {
  id: string;
  runner_id: string;
  last_heartbeat: string;
  active_sessions: number;
  total_sessions_executed: number;
  total_failures: number;
  uptime_seconds: number;
}

interface MetricsDashboardProps {
  sessions: Session[];
  scenarios: Scenario[];
  runners: RunnerHealth[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(142 76% 36%)', 'hsl(0 84% 60%)', 'hsl(45 93% 47%)'];

export function MetricsDashboard({ sessions, scenarios, runners }: MetricsDashboardProps) {
  // Success rate by scenario
  const scenarioMetrics = useMemo(() => {
    const metrics = new Map<string, { name: string; success: number; failed: number; total: number }>();

    sessions.forEach((session) => {
      if (!session.scenario_id) return;

      const scenario = scenarios.find((s) => s.id === session.scenario_id);
      const name = scenario?.name || 'Unknown';

      const existing = metrics.get(session.scenario_id) || { name, success: 0, failed: 0, total: 0 };
      existing.total++;
      if (session.status === 'success') existing.success++;
      if (session.status === 'error') existing.failed++;
      metrics.set(session.scenario_id, existing);
    });

    return Array.from(metrics.values()).map((m) => ({
      ...m,
      successRate: m.total > 0 ? Math.round((m.success / m.total) * 100) : 0,
    }));
  }, [sessions, scenarios]);

  // Status distribution
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1;
    });

    return Object.entries(counts).map(([status, count]) => ({
      name: status,
      value: count,
    }));
  }, [sessions]);

  // Executions over time (last 7 days)
  const executionTrend = useMemo(() => {
    const days: Record<string, { date: string; success: number; failed: number }> = {};

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      days[key] = { date: key, success: 0, failed: 0 };
    }

    sessions.forEach((s) => {
      if (!s.completed_at) return;
      const date = s.completed_at.split('T')[0];
      if (days[date]) {
        if (s.status === 'success') days[date].success++;
        if (s.status === 'error') days[date].failed++;
      }
    });

    return Object.values(days);
  }, [sessions]);

  // Runner health
  const runnerMetrics = useMemo(() => {
    return runners.map((r) => {
      const isOnline = new Date(r.last_heartbeat).getTime() > Date.now() - 60000;
      return {
        ...r,
        isOnline,
        failureRate: r.total_sessions_executed > 0 
          ? Math.round((r.total_failures / r.total_sessions_executed) * 100) 
          : 0,
        uptimeHours: Math.round(r.uptime_seconds / 3600),
      };
    });
  }, [runners]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Success Rate by Scenario */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Success Rate by Scenario
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scenarioMetrics.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scenarioMetrics} layout="vertical">
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value}%`, 'Success Rate']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
                <Bar dataKey="successRate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No scenario data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Distribution */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Session Status Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statusDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No session data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Execution Trend */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Execution Trend (7 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={executionTrend}>
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip 
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              />
              <Line 
                type="monotone" 
                dataKey="success" 
                stroke="hsl(142 76% 36%)" 
                strokeWidth={2} 
                dot={{ r: 3 }}
                name="Success"
              />
              <Line 
                type="monotone" 
                dataKey="failed" 
                stroke="hsl(0 84% 60%)" 
                strokeWidth={2} 
                dot={{ r: 3 }}
                name="Failed"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Runner Health */}
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Runner Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runnerMetrics.length > 0 ? (
            <div className="space-y-3">
              {runnerMetrics.map((runner) => (
                <div key={runner.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${runner.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm font-mono">{runner.runner_id}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{runner.active_sessions} active</span>
                    <span>{runner.total_sessions_executed} total</span>
                    {runner.failureRate > 10 && (
                      <span className="text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {runner.failureRate}% fail
                      </span>
                    )}
                    <span>{runner.uptimeHours}h uptime</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">
              No runners connected
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
