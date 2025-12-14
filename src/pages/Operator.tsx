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

const Operator = () => {
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-flash');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg">Operator</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <OperatorBalanceHeader 
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
            <Separator orientation="vertical" className="h-6 mx-1" />
            <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground hover:text-foreground">
              <Link to="/dashboard">
                <Code2 className="h-4 w-4" />
                <span className="hidden sm:inline">Developer</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto">
          {/* Command Section */}
          <div className="mb-8">
            <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="p-0">
                {/* Input Area */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <Textarea
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder="What needs to be done? Example: Play this Spotify track with 5 profiles https://open.spotify.com/track/..."
                        className="min-h-[60px] resize-none border-0 bg-transparent focus-visible:ring-0 text-base p-0 placeholder:text-muted-foreground/60"
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
                <div className="px-4 py-3 bg-muted/30 border-t border-border/50 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    ⌘/Ctrl + Enter to run
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <Button 
                      onClick={handleSubmit} 
                      disabled={isProcessing || !command.trim()}
                      className="gap-2 min-w-[100px]"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Planning...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Run
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{totalRunning}</div>
                    <div className="text-xs text-muted-foreground">Running Now</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Target className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{totalActive}</div>
                    <div className="text-xs text-muted-foreground">Active Tasks</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{totalCompleted}</div>
                    <div className="text-xs text-muted-foreground">Completed</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{totalFailed}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Grid: Tasks + Sessions */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Tasks Column */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Active Tasks
                </h2>
                {activeTasks.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {activeTasks.length}
                  </Badge>
                )}
              </div>

              {activeTasks.length > 0 ? (
                <div className="space-y-3">
                  {activeTasks.map((task) => (
                    <Card key={task.id} className="overflow-hidden bg-card/50 border-border/50 hover:border-border transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {task.status === 'active' ? (
                                <Activity className="w-4 h-4 text-primary animate-pulse flex-shrink-0" />
                              ) : (
                                <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              )}
                              <span className="font-medium truncate">{task.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                {task.sessionsRunning} working
                              </span>
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-success" />
                                {task.sessionsCompleted}
                              </span>
                              <span className="flex items-center gap-1">
                                <XCircle className="w-3 h-3 text-destructive" />
                                {task.sessionsFailed}
                              </span>
                              <span>/ {task.sessionsTotal} total</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStop(task.id)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Square className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        <div className="space-y-1">
                          <Progress value={task.progress} className="h-2" />
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{task.progress}% complete</span>
                            {task.startedAt && (
                              <span>{new Date(task.startedAt).toLocaleTimeString()}</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="bg-card/30 border-dashed">
                  <CardContent className="py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <Target className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm">No active tasks</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">Describe what you need above</p>
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
                {activeSessions.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {activeSessions.filter(s => s.status === 'running').length} active
                  </Badge>
                )}
              </div>

              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
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
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 text-center text-xs text-muted-foreground/60 border-t border-border/30">
        Auto-scheduling • Auto-retry • Captcha handling • Session recovery
      </footer>
    </div>
  );
};

export default Operator;
