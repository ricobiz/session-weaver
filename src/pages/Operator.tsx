import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { 
  Send, 
  Square,
  Code2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  MonitorPlay,
  Zap,
  Target,
  TrendingUp,
  Bot,
  Sparkles,
  Wifi,
  WifiOff,
  Server,
  CircleDot,
} from 'lucide-react';
import { OperatorBalanceHeader } from '@/components/operator/OperatorBalanceHeader';
import { ActiveSessionsList } from '@/components/operator/ActiveSessionsList';
import { SessionDetailPanel } from '@/components/operator/SessionDetailPanel';

interface TaskSummary {
  id: string;
  name: string;
  status: string;
  progress: number;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsFailed: number;
  sessionsRunning: number;
  startedAt: string | null;
  estimatedCost: number;
}

interface ActiveSession {
  id: string;
  status: string;
  progress: number;
  current_step: number;
  total_steps: number;
  runner_id?: string;
  captcha_status?: string;
  captcha_detected_at?: string;
  profile_state?: string;
  error_message?: string;
  last_screenshot_url?: string;
  current_url?: string;
  profiles?: { name: string } | null;
  current_action?: string;
}

interface RunnerHealth {
  id: string;
  runner_id: string;
  last_heartbeat: string;
  active_sessions: number;
}

const Operator = () => {
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-flash');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Fetch runner health for system status
  const { data: runners = [] } = useQuery({
    queryKey: ['operator-runners'],
    queryFn: async () => {
      const { data } = await supabase
        .from('runner_health')
        .select('*')
        .order('last_heartbeat', { ascending: false });
      return (data || []) as RunnerHealth[];
    },
    refetchInterval: 5000,
  });

  // Check if runners are online (heartbeat within last 30 seconds)
  const onlineRunners = runners.filter(r => {
    const lastBeat = new Date(r.last_heartbeat).getTime();
    return Date.now() - lastBeat < 30000;
  });
  const systemOnline = onlineRunners.length > 0;

  // Fetch active tasks with aggregated progress
  const { data: activeTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ['operator-tasks'],
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .in('status', ['active', 'pending', 'paused'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      
      const taskSummaries: TaskSummary[] = await Promise.all(
        (tasks || []).map(async (task) => {
          const { data: sessions } = await supabase
            .from('sessions')
            .select('status')
            .eq('task_id', task.id);
          
          const completed = sessions?.filter(s => s.status === 'success').length || 0;
          const failed = sessions?.filter(s => s.status === 'error').length || 0;
          const running = sessions?.filter(s => s.status === 'running').length || 0;
          const total = sessions?.length || 0;
          const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
          
          return {
            id: task.id,
            name: task.name,
            status: task.status,
            progress,
            sessionsTotal: total,
            sessionsCompleted: completed,
            sessionsFailed: failed,
            sessionsRunning: running,
            startedAt: task.started_at,
            estimatedCost: total * 0.02,
          };
        })
      );
      
      return taskSummaries;
    },
    refetchInterval: 3000,
  });

  // Fetch active sessions (running, queued, paused)
  const { data: activeSessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ['operator-sessions'],
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
          captcha_status,
          captcha_detected_at,
          profile_state,
          error_message,
          last_screenshot_url,
          current_url,
          metadata,
          profiles ( name )
        `)
        .in('status', ['running', 'queued', 'paused'])
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      return (data || []).map(s => ({
        ...s,
        current_action: (s.metadata as any)?.current_action,
      })) as ActiveSession[];
    },
    refetchInterval: 2000,
  });

  // Get selected session details
  const selectedSession = activeSessions.find(s => s.id === selectedSessionId) || null;

  // Aggregate stats
  const totalActive = activeTasks.filter(t => t.status === 'active').length;
  const totalCompleted = activeTasks.reduce((acc, t) => acc + t.sessionsCompleted, 0);
  const totalFailed = activeTasks.reduce((acc, t) => acc + t.sessionsFailed, 0);
  const totalRunning = activeSessions.filter(s => s.status === 'running').length;
  const totalQueued = activeSessions.filter(s => s.status === 'queued').length;

  const handleSubmit = async () => {
    if (!command.trim()) return;
    
    setIsProcessing(true);
    setStatusMessage('Understanding your request...');

    try {
      const lowerCommand = command.toLowerCase();
      
      let platform = 'web';
      if (lowerCommand.includes('spotify')) platform = 'spotify';
      else if (lowerCommand.includes('youtube')) platform = 'youtube';
      else if (lowerCommand.includes('soundcloud')) platform = 'soundcloud';
      else if (lowerCommand.includes('tiktok')) platform = 'tiktok';
      
      const urlMatch = command.match(/https?:\/\/[^\s]+/);
      const targetUrl = urlMatch ? urlMatch[0] : null;
      
      const profileMatch = command.match(/(\d+)\s*(?:profiles?|accounts?|users?)/i);
      const runMatch = command.match(/(\d+)\s*(?:times?|runs?|x)/i);
      const profileCount = profileMatch ? parseInt(profileMatch[1]) : 3;
      const runCount = runMatch ? parseInt(runMatch[1]) : 1;

      setStatusMessage('AI is planning the scenario...');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/planner/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal: command,
            platform,
            input: targetUrl,
            model: selectedModel,
            profile_count: profileCount,
            run_count: runCount,
            constraints: {
              min_watch_percent: 70,
              max_watch_percent: 100,
              human_behavior: true,
            },
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Planning failed');
      }

      setStatusMessage('');
      setCommand('');
      refetchTasks();
      refetchSessions();
      
      toast({ 
        title: 'Task started', 
        description: `${result.sessions_created} sessions queued` 
      });

    } catch (error) {
      console.error('Task creation failed:', error);
      setStatusMessage('');
      toast({ 
        title: 'Planning failed', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStop = async (taskId: string) => {
    try {
      await supabase
        .from('tasks')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', taskId);
      
      await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('task_id', taskId)
        .in('status', ['queued', 'running', 'paused']);
      
      refetchTasks();
      refetchSessions();
      toast({ title: 'Task stopped' });
    } catch {
      toast({ title: 'Failed to stop task', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden">
      {/* Header - Fixed width, no overflow */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <div className="w-full max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo - Fixed width */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-base sm:text-lg">Operator</span>
          </div>
          
          {/* Right Side - Flexible with overflow hidden */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <OperatorBalanceHeader 
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground hover:text-foreground px-2 sm:px-3">
              <Link to="/dashboard">
                <Code2 className="h-4 w-4" />
                <span className="hidden sm:inline">Developer</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* System Status Banner */}
      <div className="border-b border-border/30 bg-card/30">
        <div className="w-full max-w-[1400px] mx-auto px-4 py-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            {/* System Status */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {systemOnline ? (
                  <>
                    <div className="relative">
                      <Wifi className="w-4 h-4 text-success" />
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-success rounded-full animate-pulse" />
                    </div>
                    <span className="text-xs font-medium text-success">System Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-destructive" />
                    <span className="text-xs font-medium text-destructive">Offline</span>
                  </>
                )}
              </div>
              
              {/* Workers Count */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Server className="w-3.5 h-3.5" />
                <span>{onlineRunners.length} worker{onlineRunners.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Live Activity Indicators */}
            <div className="flex items-center gap-3">
              {totalRunning > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-medium text-primary">{totalRunning} running</span>
                </div>
              )}
              {totalQueued > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border/50">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{totalQueued} queued</span>
                </div>
              )}
              {totalRunning === 0 && totalQueued === 0 && (
                <span className="text-xs text-muted-foreground">Idle</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 py-6">
        {/* Command Section */}
        <div className="mb-6">
          <Card className="overflow-hidden border-border/50 bg-card/50">
            <CardContent className="p-0">
              {/* Input Area */}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Textarea
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="What needs to be done? Example: Play Spotify track with 5 profiles"
                      className="min-h-[50px] resize-none border-0 bg-transparent focus-visible:ring-0 text-sm sm:text-base p-0 placeholder:text-muted-foreground/50"
                      disabled={isProcessing}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                      }}
                    />
                    {statusMessage && (
                      <p className="text-sm text-primary mt-2 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {statusMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Action Bar */}
              <div className="px-4 py-2.5 bg-muted/20 border-t border-border/30 flex items-center justify-between">
                <span className="text-[10px] sm:text-xs text-muted-foreground/70">
                  ⌘/Ctrl + Enter
                </span>
                <Button 
                  onClick={handleSubmit} 
                  disabled={isProcessing || !command.trim()}
                  size="sm"
                  className="gap-2"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{isProcessing ? 'Planning...' : 'Run'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl sm:text-2xl font-bold tabular-nums">{totalRunning}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Running</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl sm:text-2xl font-bold tabular-nums">{totalActive}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Tasks</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl sm:text-2xl font-bold tabular-nums">{totalCompleted}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Done</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl sm:text-2xl font-bold tabular-nums">{totalFailed}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Failed</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Grid: Tasks + Sessions */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
          {/* Tasks Column */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Active Tasks
              </h2>
              {activeTasks.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {activeTasks.length}
                </Badge>
              )}
            </div>

            {activeTasks.length > 0 ? (
              <div className="space-y-3">
                {activeTasks.map((task) => (
                  <Card key={task.id} className="overflow-hidden bg-card/50 border-border/40">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {task.status === 'active' ? (
                              <div className="relative flex-shrink-0">
                                <Activity className="w-4 h-4 text-primary" />
                                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse" />
                              </div>
                            ) : (
                              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="font-medium text-sm truncate">{task.name}</span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-muted-foreground flex-wrap">
                            {task.sessionsRunning > 0 && (
                              <span className="flex items-center gap-1 text-primary">
                                <CircleDot className="w-3 h-3 animate-pulse" />
                                {task.sessionsRunning}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-success" />
                              {task.sessionsCompleted}
                            </span>
                            <span className="flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-destructive" />
                              {task.sessionsFailed}
                            </span>
                            <span className="text-muted-foreground/60">/ {task.sessionsTotal}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStop(task.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      
                      <div className="space-y-1">
                        <Progress value={task.progress} className="h-1.5" />
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{task.progress}%</span>
                          {task.startedAt && (
                            <span>{new Date(task.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-card/30 border-dashed border-border/40">
                <CardContent className="py-10 text-center">
                  <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-3">
                    <Target className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">No active tasks</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">Describe what you need above</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sessions Column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MonitorPlay className="w-4 h-4" />
                Workers
              </h2>
              {activeSessions.filter(s => s.status === 'running').length > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {activeSessions.filter(s => s.status === 'running').length}
                </Badge>
              )}
            </div>

            <Card className="bg-card/50 border-border/40">
              <CardContent className="p-0">
                <ScrollArea className="h-[350px] sm:h-[400px]">
                  <div className="p-3">
                    <ActiveSessionsList 
                      sessions={activeSessions}
                      onSessionClick={setSelectedSessionId}
                      selectedSessionId={selectedSessionId || undefined}
                    />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Session Detail Panel */}
            {selectedSession && (
              <SessionDetailPanel 
                session={selectedSession}
                onClose={() => setSelectedSessionId(null)}
                onRefresh={() => refetchSessions()}
              />
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 text-center text-[10px] sm:text-xs text-muted-foreground/50 border-t border-border/20">
        Auto-scheduling • Auto-retry • Captcha handling • Session recovery
      </footer>
    </div>
  );
};

export default Operator;
