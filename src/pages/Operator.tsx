import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  Bot,
  Sparkles,
  WifiOff,
  Server,
  Image,
  User,
  ExternalLink,
  RotateCw,
  Zap,
  Brain,
  Pause,
  Play,
  Trash2,
  Copy,
} from 'lucide-react';
import { OperatorBalanceHeader } from '@/components/operator/OperatorBalanceHeader';
import { TaskPlanner } from '@/components/TaskPlanner';
import { TaskSupervisor } from '@/components/TaskSupervisor';

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
}

interface ActiveSession {
  id: string;
  status: string;
  progress: number;
  current_step: number;
  total_steps: number;
  runner_id?: string;
  captcha_status?: string;
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

interface ChatMessage {
  id: string;
  type: 'user' | 'system' | 'screenshot' | 'error' | 'success' | 'planning' | 'supervisor' | 'ai';
  content: string;
  timestamp: Date;
  sessionId?: string;
  imageUrl?: string;
  taskId?: string;
  userCommand?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STORAGE_KEY_MODEL = 'operator-selected-model';
const STORAGE_KEY_CONVERSATION = 'operator-conversation-history';

const Operator = () => {
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_MODEL) || 'google/gemini-2.5-flash';
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONVERSATION);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [loadingScreenshots, setLoadingScreenshots] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist model selection
  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem(STORAGE_KEY_MODEL, model);
  };

  // Persist conversation history
  useEffect(() => {
    if (conversationHistory.length > 0) {
      localStorage.setItem(STORAGE_KEY_CONVERSATION, JSON.stringify(conversationHistory.slice(-50))); // Keep last 50 messages
    }
  }, [conversationHistory]);

  // Clear conversation history
  const clearConversation = () => {
    setConversationHistory([]);
    setChatMessages([]);
    localStorage.removeItem(STORAGE_KEY_CONVERSATION);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

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

  const onlineRunners = runners.filter(r => {
    const lastBeat = new Date(r.last_heartbeat).getTime();
    return Date.now() - lastBeat < 30000;
  });
  const systemOnline = onlineRunners.length > 0;

  // Fetch active tasks
  const { data: activeTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ['operator-tasks'],
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .in('status', ['active', 'pending', 'paused'])
        .order('created_at', { ascending: false })
        .limit(10);

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
          };
        })
      );
      
      return taskSummaries;
    },
    refetchInterval: 3000,
  });

  // Fetch active sessions
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

  // Stats
  const totalRunning = activeSessions.filter(s => s.status === 'running').length;
  const totalQueued = activeSessions.filter(s => s.status === 'queued').length;
  const totalCompleted = activeTasks.reduce((acc, t) => acc + t.sessionsCompleted, 0);
  const totalFailed = activeTasks.reduce((acc, t) => acc + t.sessionsFailed, 0);

  const addMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setChatMessages(prev => [...prev, {
      ...msg,
      id: Math.random().toString(36).slice(2),
      timestamp: new Date(),
    }]);
  };

  const handleSubmit = async () => {
    if (!command.trim()) return;
    
    const userCommand = command;
    setCommand('');
    setIsProcessing(true);
    
    // Add user message to chat
    addMessage({ type: 'user', content: userCommand });
    
    // Add to conversation history for AI context
    const newConversation: ConversationMessage[] = [
      ...conversationHistory,
      { role: 'user', content: userCommand }
    ];
    setConversationHistory(newConversation);
    
    try {
      // Call AI to analyze intent
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: newConversation,
            model: selectedModel,
            context: {
              activeTasks: activeTasks,
              activeSessions: activeSessions.slice(0, 10),
              systemStatus: {
                online: systemOnline,
                workers: onlineRunners.length
              }
            }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      const aiResponse = await response.json();
      
      if (aiResponse.type === 'error') {
        throw new Error(aiResponse.error);
      }
      
      if (aiResponse.type === 'task_plan') {
        // AI determined this is a task request - show planner with pre-parsed plan
        setConversationHistory(prev => [...prev, { 
          role: 'assistant', 
          content: `I'll create a task for: ${aiResponse.task.name}. ${aiResponse.reasoning || ''}` 
        }]);
        
        addMessage({ 
          type: 'ai', 
          content: aiResponse.reasoning || `Creating task: ${aiResponse.task.name}` 
        });
        
        setChatMessages(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          type: 'planning',
          content: userCommand,
          userCommand,
          timestamp: new Date(),
        }]);
      } else {
        // Conversational response
        const aiMessage = aiResponse.message || aiResponse.content || JSON.stringify(aiResponse);
        
        setConversationHistory(prev => [...prev, { role: 'assistant', content: aiMessage }]);
        addMessage({ type: 'ai', content: aiMessage });
      }

    } catch (error) {
      console.error('AI chat error:', error);
      addMessage({ 
        type: 'error', 
        content: error instanceof Error ? error.message : 'Failed to process message' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlanApproved = async (taskId: string, _plan: any) => {
    // Remove planning message
    setChatMessages(prev => prev.filter(m => m.type !== 'planning'));
    
    setIsProcessing(true);
    
    try {
      // Start task execution
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/start`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) {
        throw new Error('Failed to start task');
      }

      const result = await response.json();
      
      // Add supervisor message
      const task = await supabase.from('tasks').select('name').eq('id', taskId).single();
      setChatMessages(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        type: 'supervisor',
        content: task.data?.name || 'Task',
        taskId,
        timestamp: new Date(),
      }]);

      toast({ title: 'Task started', description: `${result.created} sessions queued` });
      refetchTasks();
      refetchSessions();

    } catch (error) {
      addMessage({ 
        type: 'error', 
        content: error instanceof Error ? error.message : 'Failed to start task' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlanCancelled = () => {
    setChatMessages(prev => prev.filter(m => m.type !== 'planning'));
  };

  const handleTaskComplete = (taskId: string, success: boolean) => {
    // Remove supervisor message
    setChatMessages(prev => prev.filter(m => m.taskId !== taskId));
    
    addMessage({
      type: success ? 'success' : 'error',
      content: success ? 'Task completed successfully!' : 'Task finished with some failures',
    });

    refetchTasks();
    refetchSessions();
  };

  const requestScreenshot = async (sessionId: string) => {
    setLoadingScreenshots(prev => new Set(prev).add(sessionId));
    
    try {
      // Fetch latest session data
      const { data: session } = await supabase
        .from('sessions')
        .select('last_screenshot_url, current_url, profiles(name)')
        .eq('id', sessionId)
        .single();
      
      if (session?.last_screenshot_url) {
        addMessage({
          type: 'screenshot',
          content: `Screenshot from ${session.profiles?.name || 'Worker'}`,
          sessionId,
          imageUrl: session.last_screenshot_url,
        });
      } else {
        addMessage({
          type: 'system',
          content: `No screenshot available for this session yet`,
          sessionId,
        });
      }
    } catch (error) {
      addMessage({
        type: 'error',
        content: 'Failed to get screenshot',
        sessionId,
      });
    } finally {
      setLoadingScreenshots(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
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
      
      addMessage({ type: 'system', content: 'Task stopped' });
      refetchTasks();
      refetchSessions();
    } catch {
      toast({ title: 'Failed to stop task', variant: 'destructive' });
    }
  };

  const handlePauseTask = async (taskId: string) => {
    try {
      await supabase.from('tasks').update({ status: 'paused' }).eq('id', taskId);
      await supabase.from('sessions').update({ status: 'paused' }).eq('task_id', taskId).eq('status', 'queued');
      addMessage({ type: 'system', content: 'Task paused' });
      refetchTasks();
    } catch {
      toast({ title: 'Failed to pause task', variant: 'destructive' });
    }
  };

  const handleResumeTask = async (taskId: string) => {
    try {
      await supabase.from('tasks').update({ status: 'active' }).eq('id', taskId);
      await supabase.from('sessions').update({ status: 'queued' }).eq('task_id', taskId).eq('status', 'paused');
      addMessage({ type: 'system', content: 'Task resumed' });
      refetchTasks();
    } catch {
      toast({ title: 'Failed to resume task', variant: 'destructive' });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      // First cancel all sessions
      await supabase.from('sessions').update({ status: 'cancelled' }).eq('task_id', taskId);
      // Delete task
      await supabase.from('tasks').delete().eq('id', taskId);
      addMessage({ type: 'system', content: 'Task deleted' });
      refetchTasks();
      refetchSessions();
    } catch {
      toast({ title: 'Failed to delete task', variant: 'destructive' });
    }
  };

  const handleDuplicateTask = async (taskId: string) => {
    try {
      const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single();
      if (!task) return;
      
      const { data: newTask, error } = await supabase.from('tasks').insert({
        name: `${task.name} (copy)`,
        description: task.description,
        target_platform: task.target_platform,
        target_url: task.target_url,
        goal_type: task.goal_type,
        entry_method: task.entry_method,
        behavior_config: task.behavior_config,
        profile_ids: task.profile_ids,
        status: 'pending',
      }).select().single();
      
      if (error) throw error;
      addMessage({ type: 'success', content: `Task duplicated: ${newTask.name}` });
      refetchTasks();
    } catch {
      toast({ title: 'Failed to duplicate task', variant: 'destructive' });
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Compact Header */}
      <header className="flex-shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-sm px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">Operator</span>
          </div>
          
          <div className="flex items-center gap-2">
            <OperatorBalanceHeader 
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
            />
            <Separator orientation="vertical" className="h-5" />
            <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-muted-foreground">
              <Link to="/dashboard">
                <Code2 className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Compact Stats Bar */}
      <div className="flex-shrink-0 border-b border-border/30 bg-card/30 px-3 py-1.5">
        <div className="flex items-center gap-3 text-[11px]">
          {/* System Status */}
          <div className="flex items-center gap-1.5">
            {systemOnline ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-500">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-destructive" />
                <span className="text-destructive">Offline</span>
              </>
            )}
          </div>
          
          <Separator orientation="vertical" className="h-3" />
          
          {/* Quick Stats */}
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Server className="w-3 h-3" />
              {onlineRunners.length}
            </span>
            {totalRunning > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <Zap className="w-3 h-3" />
                {totalRunning}
              </span>
            )}
            {totalQueued > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {totalQueued}
              </span>
            )}
            <span className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="w-3 h-3" />
              {totalCompleted}
            </span>
            {totalFailed > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="w-3 h-3" />
                {totalFailed}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chat Area - Main content */}
      <div className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="p-3 space-y-3">
            {/* Active Sessions as compact cards */}
            {activeSessions.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  Active Workers
                </span>
                <div className="flex flex-wrap gap-2">
                  {activeSessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => requestScreenshot(session.id)}
                      disabled={loadingScreenshots.has(session.id)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card/80 border border-border/50 hover:border-primary/50 hover:bg-card transition-all text-left group"
                    >
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        session.status === 'running' ? 'bg-primary animate-pulse' :
                        session.status === 'queued' ? 'bg-muted-foreground' :
                        'bg-amber-500'
                      }`} />
                      <span className="text-xs font-medium truncate max-w-[100px]">
                        {session.profiles?.name || session.id.slice(0, 6)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {session.current_step || 0}/{session.total_steps || '?'}
                      </span>
                      {loadingScreenshots.has(session.id) ? (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      ) : (
                        <Image className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active Tasks as compact items */}
            {activeTasks.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  Tasks
                </span>
                {activeTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/60 border border-border/40">
                    {task.status === 'paused' ? (
                      <Pause className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    ) : task.sessionsRunning > 0 ? (
                      <Activity className="w-3.5 h-3.5 text-primary animate-pulse flex-shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate flex-1">{task.name}</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{task.progress}%</span>
                      <span className="text-emerald-500">{task.sessionsCompleted}</span>
                      <span>/</span>
                      <span>{task.sessionsTotal}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {/* Pause/Resume */}
                      {task.status === 'paused' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleResumeTask(task.id)}
                          className="h-6 w-6 p-0 hover:bg-emerald-500/10 hover:text-emerald-500"
                          title="Resume"
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePauseTask(task.id)}
                          className="h-6 w-6 p-0 hover:bg-amber-500/10 hover:text-amber-500"
                          title="Pause"
                        >
                          <Pause className="w-3 h-3" />
                        </Button>
                      )}
                      {/* Duplicate */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDuplicateTask(task.id)}
                        className="h-6 w-6 p-0 hover:bg-primary/10 hover:text-primary"
                        title="Duplicate"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      {/* Stop */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStop(task.id)}
                        className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                        title="Stop"
                      >
                        <Square className="w-3 h-3" />
                      </Button>
                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteTask(task.id)}
                        className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Chat Messages */}
            {chatMessages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                {/* Planning message - shows TaskPlanner */}
                {msg.type === 'planning' && msg.userCommand && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-3 h-3 text-primary" />
                    </div>
                    <div className="max-w-[90%]">
                      <TaskPlanner
                        userCommand={msg.userCommand}
                        onApprove={handlePlanApproved}
                        onCancel={handlePlanCancelled}
                      />
                    </div>
                  </div>
                )}

                {/* Supervisor message - shows TaskSupervisor */}
                {msg.type === 'supervisor' && msg.taskId && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-3 h-3 text-primary" />
                    </div>
                    <div className="max-w-[90%] w-full">
                      <TaskSupervisor
                        taskId={msg.taskId}
                        taskName={msg.content}
                        onComplete={(success) => handleTaskComplete(msg.taskId!, success)}
                        onRequestInput={async (question) => {
                          // This could be enhanced with a modal or inline input
                          return window.prompt(question) || '';
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Regular messages */}
                {msg.type !== 'planning' && msg.type !== 'supervisor' && (
                  <div className={`flex gap-2 ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.type !== 'user' && (
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.type === 'error' ? 'bg-destructive/10' :
                        msg.type === 'success' ? 'bg-emerald-500/10' :
                        msg.type === 'screenshot' ? 'bg-primary/10' :
                        msg.type === 'ai' ? 'bg-primary/10' :
                        'bg-muted/50'
                      }`}>
                        {msg.type === 'error' ? <XCircle className="w-3 h-3 text-destructive" /> :
                         msg.type === 'success' ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> :
                         msg.type === 'screenshot' ? <Image className="w-3 h-3 text-primary" /> :
                         msg.type === 'ai' ? <Bot className="w-3 h-3 text-primary" /> :
                         <Sparkles className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    )}
                    
                    <div className={`max-w-[85%] ${msg.type === 'user' ? 'order-first' : ''}`}>
                      <div className={`px-3 py-2 rounded-2xl text-sm ${
                        msg.type === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' :
                        msg.type === 'error' ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-md' :
                        msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-bl-md' :
                        msg.type === 'ai' ? 'bg-primary/5 border border-primary/20 rounded-bl-md' :
                        'bg-card border border-border/50 rounded-bl-md'
                      }`}>
                        {msg.content}
                      </div>
                      
                      {msg.imageUrl && (
                        <div className="mt-2 rounded-lg overflow-hidden border border-border/50 max-w-[300px]">
                          <img 
                            src={msg.imageUrl} 
                            alt="Session screenshot" 
                            className="w-full h-auto"
                            loading="lazy"
                          />
                          <div className="p-2 bg-card/80 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Session: {msg.sessionId?.slice(0, 8)}</span>
                            <a 
                              href={msg.imageUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:text-primary"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      )}
                      
                      <span className="text-[9px] text-muted-foreground/50 px-1 mt-0.5 block">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    {msg.type === 'user' && (
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <User className="w-3 h-3 text-primary" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Empty state */}
            {chatMessages.length === 0 && activeTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Describe what you need</p>
                <p className="text-xs text-muted-foreground/50 mt-1">Example: Play Spotify track with 5 profiles</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Compact Input */}
        <div className="flex-shrink-0 border-t border-border/40 bg-background p-2">
          <div className="flex items-end gap-2">
            <Textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="What needs to be done?"
              className="min-h-[40px] max-h-[120px] resize-none border-border/50 bg-card/50 text-sm py-2.5 px-3 rounded-xl"
              disabled={isProcessing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
              rows={1}
            />
            <Button 
              onClick={handleSubmit} 
              disabled={isProcessing || !command.trim()}
              size="sm"
              className="h-10 w-10 rounded-xl p-0 flex-shrink-0"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[9px] text-muted-foreground/50">⌘+Enter to send</span>
            <div className="flex items-center gap-1">
              {conversationHistory.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearConversation}
                  className="h-5 text-[9px] text-muted-foreground/50 hover:text-destructive px-1"
                >
                  <Trash2 className="w-2.5 h-2.5 mr-1" />
                  Clear
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { refetchTasks(); refetchSessions(); }}
                className="h-5 text-[9px] text-muted-foreground/50 hover:text-muted-foreground px-1"
              >
                <RotateCw className="w-2.5 h-2.5 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Operator;
