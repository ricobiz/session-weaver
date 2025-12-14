import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
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
  DollarSign,
  Activity,
} from 'lucide-react';

interface TaskSummary {
  id: string;
  name: string;
  status: string;
  progress: number;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsFailed: number;
  startedAt: string | null;
  estimatedCost: number;
}

const Operator = () => {
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready. Tell me what you need.');

  // Fetch active tasks with aggregated progress
  const { data: activeTasks = [], refetch } = useQuery({
    queryKey: ['operator-tasks'],
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .in('status', ['active', 'pending', 'paused'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      
      // Get session counts for each task
      const taskSummaries: TaskSummary[] = await Promise.all(
        (tasks || []).map(async (task) => {
          const { data: sessions } = await supabase
            .from('sessions')
            .select('status')
            .eq('task_id', task.id);
          
          const completed = sessions?.filter(s => s.status === 'success').length || 0;
          const failed = sessions?.filter(s => s.status === 'error').length || 0;
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
            startedAt: task.started_at,
            estimatedCost: total * 0.02, // Rough estimate
          };
        })
      );
      
      return taskSummaries;
    },
    refetchInterval: 3000,
  });

  // Aggregate stats
  const totalActive = activeTasks.filter(t => t.status === 'active').length;
  const totalCompleted = activeTasks.reduce((acc, t) => acc + t.sessionsCompleted, 0);
  const totalFailed = activeTasks.reduce((acc, t) => acc + t.sessionsFailed, 0);
  const totalCost = activeTasks.reduce((acc, t) => acc + t.estimatedCost, 0);

  const handleSubmit = async () => {
    if (!command.trim()) return;
    
    setIsProcessing(true);
    setStatusMessage('Understanding your request...');

    try {
      // Parse command into task parameters
      const lowerCommand = command.toLowerCase();
      
      // Extract platform
      let platform = 'web';
      if (lowerCommand.includes('spotify')) platform = 'spotify';
      else if (lowerCommand.includes('youtube')) platform = 'youtube';
      else if (lowerCommand.includes('soundcloud')) platform = 'soundcloud';
      else if (lowerCommand.includes('tiktok')) platform = 'tiktok';
      
      // Extract goal
      let goalType = 'play';
      if (lowerCommand.includes('like')) goalType = 'like';
      else if (lowerCommand.includes('follow')) goalType = 'follow';
      else if (lowerCommand.includes('comment')) goalType = 'comment';
      else if (lowerCommand.includes('share')) goalType = 'share';
      
      // Extract URL
      const urlMatch = command.match(/https?:\/\/[^\s]+/);
      const targetUrl = urlMatch ? urlMatch[0] : null;
      
      // Extract search query
      const searchMatch = command.match(/search\s+(?:for\s+)?["']?([^"']+)["']?/i) ||
                          command.match(/find\s+["']?([^"']+)["']?/i);
      const searchQuery = searchMatch ? searchMatch[1].trim() : null;
      
      // Extract counts
      const profileMatch = command.match(/(\d+)\s*(?:profiles?|accounts?|users?)/i);
      const runMatch = command.match(/(\d+)\s*(?:times?|runs?|x)/i);
      const profileCount = profileMatch ? parseInt(profileMatch[1]) : 3;
      const runCount = runMatch ? parseInt(runMatch[1]) : 1;

      setStatusMessage('Creating task...');

      // Get available profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .limit(profileCount);
      
      const profileIds = profiles?.map(p => p.id) || [];
      
      if (profileIds.length === 0) {
        toast({ title: 'No profiles available', variant: 'destructive' });
        setStatusMessage('No profiles available. Add profiles first.');
        setIsProcessing(false);
        return;
      }

      // Create task
      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          name: command.slice(0, 100),
          target_platform: platform,
          goal_type: goalType,
          target_url: targetUrl,
          search_query: searchQuery,
          entry_method: targetUrl ? 'url' : 'search',
          profile_ids: profileIds,
          run_count: runCount,
          status: 'pending',
          behavior_config: {
            min_watch_percent: 70,
            max_watch_percent: 100,
            human_behavior: true,
          },
        })
        .select()
        .single();

      if (error) throw error;

      setStatusMessage('Starting execution...');

      // Start the task
      const totalSessions = profileIds.length * runCount;
      for (let run = 0; run < runCount; run++) {
        for (const profileId of profileIds) {
          await supabase.from('sessions').insert({
            task_id: task.id,
            profile_id: profileId,
            status: 'queued',
            metadata: { run_index: run },
          });
        }
      }

      await supabase
        .from('tasks')
        .update({ 
          status: 'active', 
          started_at: new Date().toISOString(),
          sessions_created: totalSessions,
        })
        .eq('id', task.id);

      setStatusMessage(`Running: ${totalSessions} sessions queued`);
      setCommand('');
      refetch();
      
      toast({ 
        title: 'Task started', 
        description: `${totalSessions} sessions queued for execution.` 
      });

    } catch (error) {
      console.error('Task creation failed:', error);
      setStatusMessage('Failed to create task. Try again.');
      toast({ title: 'Error', description: 'Failed to process command.', variant: 'destructive' });
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
      
      refetch();
      toast({ title: 'Task stopped' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to stop task.', variant: 'destructive' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Activity className="w-4 h-4 text-primary animate-pulse" />;
      case 'paused': return <Clock className="w-4 h-4 text-warning" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Operator</h1>
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/dashboard">
              <Code2 className="h-4 w-4" />
              Developer Mode
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        {/* Status Message */}
        <p className="text-center text-muted-foreground text-sm mb-6">
          {statusMessage}
        </p>

        {/* Command Input */}
        <Card className="mb-8">
          <CardContent className="p-4">
            <Textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="What needs to be done? (e.g., Play this track on Spotify with 5 profiles)"
              className="min-h-[100px] resize-none border-0 focus-visible:ring-0 text-base"
              disabled={isProcessing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) handleSubmit();
              }}
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
              <span className="text-xs text-muted-foreground">
                ⌘ + Enter to send
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
                {isProcessing ? 'Processing...' : 'Run'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <div className="text-2xl font-bold text-foreground">{totalActive}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <div className="text-2xl font-bold text-success">{totalCompleted}</div>
            <div className="text-xs text-muted-foreground">Done</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <div className="text-2xl font-bold text-destructive">{totalFailed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <div className="text-2xl font-bold text-foreground">${totalCost.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Est. Cost</div>
          </div>
        </div>

        {/* Active Tasks */}
        {activeTasks.length > 0 && (
          <div className="space-y-3">
            {activeTasks.map((task) => (
              <Card key={task.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(task.status)}
                      <span className="text-sm font-medium truncate max-w-[300px]">
                        {task.name}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStop(task.id)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Square className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  
                  <Progress value={task.progress} className="h-2 mb-2" />
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-success" />
                        {task.sessionsCompleted}
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-destructive" />
                        {task.sessionsFailed}
                      </span>
                      <span>of {task.sessionsTotal}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {task.progress}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTasks.length === 0 && !isProcessing && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No active tasks</p>
            <p className="text-xs mt-1">Describe what you need above</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground border-t border-border/50">
        Handles: scheduling, retries, captchas, failures, recovery
      </footer>
    </div>
  );
};

export default Operator;
