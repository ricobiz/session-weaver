import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { 
  Brain,
  Pause,
  Play,
  Square,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  Wrench,
  Eye,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface TaskSession {
  id: string;
  status: string;
  progress: number;
  current_step: number;
  total_steps: number;
  error_message?: string;
  profile_name?: string;
}

interface AIDecision {
  type: 'analysis' | 'action' | 'question' | 'success' | 'error';
  message: string;
  details?: string;
  timestamp: Date;
  options?: string[];
}

interface TaskSupervisorProps {
  taskId: string;
  taskName: string;
  onComplete: (success: boolean) => void;
  onRequestInput: (question: string, options?: string[]) => Promise<string>;
}

export function TaskSupervisor({ taskId, taskName, onComplete, onRequestInput }: TaskSupervisorProps) {
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [aiDecisions, setAIDecisions] = useState<AIDecision[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [userInputNeeded, setUserInputNeeded] = useState<{ question: string; options?: string[] } | null>(null);
  const [userResponse, setUserResponse] = useState('');

  // Stats
  const completed = sessions.filter(s => s.status === 'success').length;
  const failed = sessions.filter(s => s.status === 'error').length;
  const running = sessions.filter(s => s.status === 'running').length;
  const queued = sessions.filter(s => s.status === 'queued').length;
  const total = sessions.length;
  const progress = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    const { data } = await supabase
      .from('sessions')
      .select('id, status, progress, current_step, total_steps, error_message, profiles(name)')
      .eq('task_id', taskId);

    if (data) {
      setSessions(data.map(s => ({
        ...s,
        profile_name: (s.profiles as any)?.name,
      })));
    }
    setIsLoading(false);
  }, [taskId]);

  // Subscribe to session updates
  useEffect(() => {
    fetchSessions();
    
    const channel = supabase
      .channel(`task-${taskId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `task_id=eq.${taskId}`,
      }, () => {
        fetchSessions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, fetchSessions]);

  // AI Supervisor logic
  useEffect(() => {
    if (isLoading) return;

    // Check for failures and trigger AI analysis
    const newFailures = sessions.filter(s => 
      s.status === 'error' && 
      !aiDecisions.some(d => d.message.includes(s.id.slice(0, 8)))
    );

    if (newFailures.length > 0 && !isAnalyzing) {
      analyzeFailure(newFailures[0]);
    }

    // Check if all done
    if (total > 0 && (completed + failed) === total) {
      const success = failed === 0;
      addAIDecision({
        type: success ? 'success' : 'error',
        message: success 
          ? `All ${completed} sessions completed successfully!`
          : `Task finished: ${completed} succeeded, ${failed} failed`,
        details: success ? undefined : 'I can analyze failures and suggest fixes.',
      });
      
      // Only call onComplete once
      setTimeout(() => onComplete(success), 1000);
    }
  }, [sessions, isLoading]);

  const addAIDecision = (decision: Omit<AIDecision, 'timestamp'>) => {
    setAIDecisions(prev => [...prev, { ...decision, timestamp: new Date() }]);
  };

  const analyzeFailure = async (session: TaskSession) => {
    setIsAnalyzing(true);
    addAIDecision({
      type: 'analysis',
      message: `Analyzing failure for session ${session.id.slice(0, 8)}...`,
    });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/logs/explain`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: session.id }),
        }
      );

      if (response.ok) {
        const analysis = await response.json();
        
        addAIDecision({
          type: 'analysis',
          message: analysis.summary || 'Analysis complete',
          details: analysis.root_cause?.description,
        });

        // Decide action based on analysis
        if (analysis.is_resumable && analysis.resume_from_step !== null) {
          addAIDecision({
            type: 'action',
            message: `Session can be resumed from step ${analysis.resume_from_step + 1}`,
            details: 'I can automatically retry this session.',
          });

          // Auto-retry for recoverable errors
          if (analysis.root_cause?.type === 'timeout' || analysis.root_cause?.type === 'network_error') {
            addAIDecision({
              type: 'action',
              message: 'Auto-retrying recoverable error...',
            });
            await retrySession(session.id);
          } else {
            // Ask user for non-obvious cases
            setUserInputNeeded({
              question: `Should I retry session ${session.id.slice(0, 8)}? ${analysis.root_cause?.description || ''}`,
              options: ['Yes, retry', 'No, skip this', 'Stop all'],
            });
          }
        } else {
          addAIDecision({
            type: 'error',
            message: 'Session cannot be resumed automatically',
            details: analysis.recommendations?.[0]?.action || 'Manual intervention may be needed.',
          });
        }
      }
    } catch (err) {
      addAIDecision({
        type: 'error',
        message: 'Failed to analyze session',
        details: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const retrySession = async (sessionId: string) => {
    try {
      // Reset session to queued
      await supabase
        .from('sessions')
        .update({
          status: 'queued',
          error_message: null,
          retry_count: supabase.rpc ? undefined : 1, // Increment if possible
        })
        .eq('id', sessionId);

      // Add back to queue
      await supabase.from('execution_queue').insert({
        session_id: sessionId,
        priority: 10, // Higher priority for retries
      });

      addAIDecision({
        type: 'action',
        message: `Requeued session ${sessionId.slice(0, 8)} for retry`,
      });

      toast({ title: 'Session requeued for retry' });
    } catch (err) {
      addAIDecision({
        type: 'error',
        message: 'Failed to retry session',
        details: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleUserResponse = async (response: string) => {
    setUserInputNeeded(null);
    setUserResponse('');

    addAIDecision({
      type: 'analysis',
      message: `User chose: ${response}`,
    });

    if (response.toLowerCase().includes('retry') || response.toLowerCase().includes('yes')) {
      const failedSession = sessions.find(s => s.status === 'error');
      if (failedSession) {
        await retrySession(failedSession.id);
      }
    } else if (response.toLowerCase().includes('stop')) {
      await pauseTask();
      addAIDecision({
        type: 'action',
        message: 'Task execution stopped by user',
      });
    }
  };

  const pauseTask = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/pause`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      if (response.ok) {
        setIsPaused(true);
        addAIDecision({ type: 'action', message: 'Task paused' });
        toast({ title: 'Task paused' });
      }
    } catch (err) {
      toast({ title: 'Failed to pause', variant: 'destructive' });
    }
  };

  const resumeTask = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/resume`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      if (response.ok) {
        setIsPaused(false);
        addAIDecision({ type: 'action', message: 'Task resumed' });
        toast({ title: 'Task resumed' });
      }
    } catch (err) {
      toast({ title: 'Failed to resume', variant: 'destructive' });
    }
  };

  const stopTask = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/stop`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      if (response.ok) {
        addAIDecision({ type: 'action', message: 'Task stopped' });
        toast({ title: 'Task stopped' });
        onComplete(false);
      }
    } catch (err) {
      toast({ title: 'Failed to stop', variant: 'destructive' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'error': return <XCircle className="h-3 w-3 text-destructive" />;
      case 'running': return <Loader2 className="h-3 w-3 text-primary animate-spin" />;
      default: return <div className="h-3 w-3 rounded-full bg-muted" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading task status...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span>AI Supervisor</span>
            {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin" />}
          </CardTitle>
          <div className="flex items-center gap-1">
            {isPaused ? (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={resumeTask}>
                <Play className="h-3 w-3" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={pauseTask}>
                <Pause className="h-3 w-3" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={stopTask}>
              <Square className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 pt-0">
        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{taskName}</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="text-green-500">{completed} done</span>
            {running > 0 && <span className="text-primary">{running} running</span>}
            {queued > 0 && <span>{queued} queued</span>}
            {failed > 0 && <span className="text-destructive">{failed} failed</span>}
          </div>
        </div>

        {/* AI Decisions Feed */}
        {aiDecisions.length > 0 && (
          <>
            <Separator />
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
              >
                <Zap className="h-3 w-3" />
                AI Activity ({aiDecisions.length})
                {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </button>
              
              {expanded && (
                <ScrollArea className="h-[100px] mt-2">
                  <div className="space-y-2 pr-2">
                    {aiDecisions.slice(-10).reverse().map((d, i) => (
                      <div key={i} className="text-xs flex items-start gap-2">
                        {d.type === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />}
                        {d.type === 'error' && <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                        {d.type === 'analysis' && <Eye className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />}
                        {d.type === 'action' && <Wrench className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                        {d.type === 'question' && <MessageSquare className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />}
                        <div>
                          <p className="text-foreground">{d.message}</p>
                          {d.details && <p className="text-muted-foreground">{d.details}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </>
        )}

        {/* User Input Request */}
        {userInputNeeded && (
          <>
            <Separator />
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-sm">{userInputNeeded.question}</p>
              </div>
              {userInputNeeded.options ? (
                <div className="flex flex-wrap gap-2">
                  {userInputNeeded.options.map((opt, i) => (
                    <Button key={i} size="sm" variant="outline" onClick={() => handleUserResponse(opt)}>
                      {opt}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={userResponse}
                    onChange={e => setUserResponse(e.target.value)}
                    placeholder="Your response..."
                    className="h-8 text-sm"
                    onKeyDown={e => e.key === 'Enter' && handleUserResponse(userResponse)}
                  />
                  <Button size="sm" onClick={() => handleUserResponse(userResponse)}>
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Session Details (collapsed by default) */}
        {expanded && sessions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">SESSIONS</p>
              <div className="grid grid-cols-2 gap-1">
                {sessions.slice(0, 6).map(s => (
                  <div key={s.id} className="flex items-center gap-1.5 text-xs p-1 rounded bg-muted/50">
                    {getStatusIcon(s.status)}
                    <span className="truncate">{s.profile_name || s.id.slice(0, 8)}</span>
                    {s.status === 'running' && (
                      <span className="text-muted-foreground ml-auto">{s.current_step}/{s.total_steps}</span>
                    )}
                  </div>
                ))}
                {sessions.length > 6 && (
                  <div className="text-xs text-muted-foreground p-1">
                    +{sessions.length - 6} more
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
