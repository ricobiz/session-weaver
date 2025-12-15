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
  Plus,
  MessageSquare,
  ChevronDown,
  History,
  Layers,
} from 'lucide-react';
import { OperatorBalanceHeader } from '@/components/operator/OperatorBalanceHeader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TaskPlanner } from '@/components/TaskPlanner';
import { TaskSupervisor } from '@/components/TaskSupervisor';
import { ChatScreenshot } from '@/components/operator/ChatScreenshot';
import { MultiSessionManager } from '@/components/operator/MultiSessionManager';

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
  type: 'user' | 'system' | 'screenshot' | 'error' | 'success' | 'planning' | 'supervisor' | 'ai' | 'action_screenshot';
  content: string;
  timestamp: Date;
  sessionId?: string;
  imageUrl?: string;
  taskId?: string;
  userCommand?: string;
  profileName?: string;
  actionName?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  name: string;
  createdAt: Date;
  messages: ChatMessage[];
  conversation: ConversationMessage[];
}

const STORAGE_KEY_MODEL = 'operator-selected-model';
const STORAGE_KEY_SESSIONS = 'operator-chat-sessions';
const STORAGE_KEY_ACTIVE_SESSION = 'operator-active-session';

const Operator = () => {
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_MODEL) || 'anthropic/claude-3.5-sonnet';
  });
  const [loadingScreenshots, setLoadingScreenshots] = useState<Set<string>>(new Set());
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScreenshotRef = useRef<Map<string, string>>(new Map());

  // Chat sessions management
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
        }));
      }
    } catch {}
    return [];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
  });

  // Get current session
  const currentSession = chatSessions.find(s => s.id === activeSessionId);
  const chatMessages = currentSession?.messages || [];
  const conversationHistory = currentSession?.conversation || [];

  // Persist sessions
  useEffect(() => {
    if (chatSessions.length > 0) {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(chatSessions.slice(-20))); // Keep last 20 sessions
    }
  }, [chatSessions]);

  // Persist active session ID
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, activeSessionId);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
    }
  }, [activeSessionId]);

  // Persist model selection
  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem(STORAGE_KEY_MODEL, model);
  };

  // Create new session
  const createNewSession = (name?: string) => {
    const newSession: ChatSession = {
      id: Math.random().toString(36).slice(2),
      name: name || `Chat ${chatSessions.length + 1}`,
      createdAt: new Date(),
      messages: [],
      conversation: [],
    };
    setChatSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    return newSession;
  };

  // Switch session
  const switchSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
  };

  // Delete session
  const deleteSession = (sessionId: string) => {
    setChatSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      const remaining = chatSessions.filter(s => s.id !== sessionId);
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Clear current session
  const clearCurrentSession = () => {
    if (!activeSessionId) return;
    setChatSessions(prev => prev.map(s => 
      s.id === activeSessionId 
        ? { ...s, messages: [], conversation: [] }
        : s
    ));
  };

  // Add message to current session
  const addMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: Math.random().toString(36).slice(2),
      timestamp: new Date(),
    };
    
    setChatSessions(prev => prev.map(s => 
      s.id === activeSessionId 
        ? { ...s, messages: [...s.messages, newMsg] }
        : s
    ));
  };

  // Update conversation in current session  
  const updateConversation = (messages: ConversationMessage[]) => {
    setChatSessions(prev => prev.map(s => 
      s.id === activeSessionId 
        ? { ...s, conversation: messages }
        : s
    ));
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

  // Fetch ALL tasks (including completed)
  const { data: allTasks = [], refetch: refetchAllTasks } = useQuery({
    queryKey: ['operator-all-tasks'],
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

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
    refetchInterval: 10000,
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

  // Auto-post screenshots on successful actions
  useEffect(() => {
    activeSessions.forEach(session => {
      if (session.status === 'running' && session.last_screenshot_url) {
        const lastUrl = lastScreenshotRef.current.get(session.id);
        if (session.last_screenshot_url !== lastUrl) {
          // New screenshot available - add to chat
          lastScreenshotRef.current.set(session.id, session.last_screenshot_url);
          
          // Only add to chat if we have an active session and it's a significant action
          const significantActions = ['click', 'like', 'comment', 'play', 'open'];
          const isSignificant = significantActions.includes(session.current_action || '');
          
          if (activeSessionId && isSignificant) {
            const screenshotMsg: ChatMessage = {
              id: Math.random().toString(36).slice(2),
              type: 'action_screenshot',
              content: `${session.profiles?.name || 'Agent'}: ${session.current_action || 'действие'}`,
              timestamp: new Date(),
              sessionId: session.id,
              imageUrl: session.last_screenshot_url,
              profileName: session.profiles?.name || 'Agent',
              actionName: session.current_action,
            };
            setChatSessions(prev => prev.map(s => 
              s.id === activeSessionId 
                ? { ...s, messages: [...s.messages, screenshotMsg] }
                : s
            ));
          }
        }
      }
    });
  }, [activeSessions, activeSessionId]);

  // Stats
  const totalRunning = activeSessions.filter(s => s.status === 'running').length;
  const totalQueued = activeSessions.filter(s => s.status === 'queued').length;
  const totalCompleted = activeTasks.reduce((acc, t) => acc + t.sessionsCompleted, 0);
  const totalFailed = activeTasks.reduce((acc, t) => acc + t.sessionsFailed, 0);

  const handleSubmit = async () => {
    if (!command.trim()) return;
    
    // Ensure we have an active session
    let sessionId = activeSessionId;
    if (!sessionId) {
      const newSession = createNewSession();
      sessionId = newSession.id;
    }
    
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
    updateConversation(newConversation);
    
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
        updateConversation([...newConversation, { 
          role: 'assistant', 
          content: `I'll create a task for: ${aiResponse.task.name}. ${aiResponse.reasoning || ''}` 
        }]);
        
        addMessage({ 
          type: 'ai', 
          content: aiResponse.reasoning || `Creating task: ${aiResponse.task.name}` 
        });
        
        // Add planning message
        const planningMsg: ChatMessage = {
          id: Math.random().toString(36).slice(2),
          type: 'planning',
          content: userCommand,
          userCommand,
          timestamp: new Date(),
        };
        setChatSessions(prev => prev.map(s => 
          s.id === activeSessionId 
            ? { ...s, messages: [...s.messages, planningMsg] }
            : s
        ));
      } else {
        // Conversational response
        const aiMessage = aiResponse.message || aiResponse.content || JSON.stringify(aiResponse);
        
        updateConversation([...newConversation, { role: 'assistant', content: aiMessage }]);
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
    setChatSessions(prev => prev.map(s => 
      s.id === activeSessionId 
        ? { ...s, messages: s.messages.filter(m => m.type !== 'planning') }
        : s
    ));
    
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
      const supervisorMsg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        type: 'supervisor',
        content: task.data?.name || 'Task',
        taskId,
        timestamp: new Date(),
      };
      setChatSessions(prev => prev.map(s => 
        s.id === activeSessionId 
          ? { ...s, messages: [...s.messages, supervisorMsg] }
          : s
      ));

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
    setChatSessions(prev => prev.map(s => 
      s.id === activeSessionId 
        ? { ...s, messages: s.messages.filter(m => m.type !== 'planning') }
        : s
    ));
  };

  const handleTaskComplete = (taskId: string, success: boolean) => {
    // Remove supervisor message
    setChatSessions(prev => prev.map(s => 
      s.id === activeSessionId 
        ? { ...s, messages: s.messages.filter(m => m.taskId !== taskId) }
        : s
    ));
    
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
      // First delete all sessions related to this task
      await supabase.from('sessions').delete().eq('task_id', taskId);
      // Delete task
      await supabase.from('tasks').delete().eq('id', taskId);
      addMessage({ type: 'system', content: 'Task deleted' });
      refetchTasks();
      refetchAllTasks();
      refetchSessions();
    } catch {
      toast({ title: 'Failed to delete task', variant: 'destructive' });
    }
  };

  const handleRestartTask = async (taskId: string) => {
    try {
      await supabase.from('tasks').update({ 
        status: 'pending', 
        started_at: null, 
        completed_at: null,
        sessions_completed: 0,
        sessions_failed: 0 
      }).eq('id', taskId);
      addMessage({ type: 'system', content: 'Task restarted' });
      refetchTasks();
      refetchAllTasks();
    } catch {
      toast({ title: 'Failed to restart task', variant: 'destructive' });
    }
  };

  // Filter completed/cancelled tasks for history
  const completedTasks = allTasks.filter(t => 
    ['completed', 'cancelled', 'failed'].includes(t.status) || 
    (t.status !== 'active' && t.status !== 'pending' && t.status !== 'paused' && t.progress === 100)
  );

  // State for showing task history panel
  const [showTaskHistory, setShowTaskHistory] = useState(false);

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
      <header className="flex-shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-sm px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          {/* Left: Logo + Chat selector */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3 h-3 text-primary-foreground" />
            </div>
            
            {/* Chat Sessions Dropdown - compact */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 gap-1 text-muted-foreground min-w-0">
                  <span className="text-[11px] truncate max-w-[60px]">
                    {currentSession?.name || 'Chat'}
                  </span>
                  <ChevronDown className="h-2.5 w-2.5 flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => createNewSession()}>
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  Новый чат
                </DropdownMenuItem>
                {chatSessions.length > 0 && <DropdownMenuSeparator />}
                {chatSessions.slice(0, 10).map(session => (
                  <DropdownMenuItem 
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    className="flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <History className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs">{session.name}</span>
                      {session.id === activeSessionId && (
                        <span className="text-[9px] text-primary">●</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Right: Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Sessions Panel Toggle */}
            <Button 
              variant={showSessionPanel ? "secondary" : "ghost"} 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={() => setShowSessionPanel(!showSessionPanel)}
              title="Потоки"
            >
              <Layers className="h-3.5 w-3.5" />
            </Button>
            
            <OperatorBalanceHeader 
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
            />
            
            {/* Developer Mode - всегда видна */}
            <Button variant="ghost" size="sm" asChild className="h-6 w-6 p-0 text-muted-foreground" title="Developer Mode">
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

      {/* Main Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Session Panel (collapsible) */}
        {showSessionPanel && (
          <div className="w-72 border-r border-border/30 bg-card/20 p-3 flex-shrink-0 overflow-y-auto">
            <MultiSessionManager
              onSessionSelect={(sessionId) => requestScreenshot(sessionId)}
              onScreenshotRequest={(sessionId, imageUrl, profileName) => {
                addMessage({
                  type: 'action_screenshot',
                  content: `Скриншот от ${profileName}`,
                  sessionId,
                  imageUrl,
                  profileName,
                });
              }}
              maxConcurrent={10}
            />
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="p-3 space-y-3 max-w-full overflow-hidden">

            {/* Active Tasks as compact items */}
            {activeTasks.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  Tasks
                </span>
                {activeTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-card/60 border border-border/40 min-w-0">
                    {task.status === 'paused' ? (
                      <Pause className="w-3 h-3 text-amber-500 flex-shrink-0" />
                    ) : task.sessionsRunning > 0 ? (
                      <Activity className="w-3 h-3 text-primary animate-pulse flex-shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-[10px] font-medium truncate flex-1 min-w-0">{task.name}</span>
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground flex-shrink-0">
                      <span>{task.progress}%</span>
                      <span className="text-emerald-500">{task.sessionsCompleted}</span>
                      <span>/</span>
                      <span>{task.sessionsTotal}</span>
                    </div>
                    <div className="flex items-center flex-shrink-0">
                      {/* Pause/Resume */}
                      {task.status === 'paused' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleResumeTask(task.id)}
                          className="h-5 w-5 p-0 hover:bg-emerald-500/10 hover:text-emerald-500"
                          title="Resume"
                        >
                          <Play className="w-2.5 h-2.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePauseTask(task.id)}
                          className="h-5 w-5 p-0 hover:bg-amber-500/10 hover:text-amber-500"
                          title="Pause"
                        >
                          <Pause className="w-2.5 h-2.5" />
                        </Button>
                      )}
                      {/* Stop */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStop(task.id)}
                        className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
                        title="Stop"
                      >
                        <Square className="w-2.5 h-2.5" />
                      </Button>
                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteTask(task.id)}
                        className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Task History Toggle & List */}
            {allTasks.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowTaskHistory(!showTaskHistory)}
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium hover:text-muted-foreground transition-colors"
                >
                  <History className="w-3 h-3" />
                  Task History ({allTasks.length})
                  <ChevronDown className={`w-3 h-3 transition-transform ${showTaskHistory ? 'rotate-180' : ''}`} />
                </button>
                
                {showTaskHistory && (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {allTasks.map((task) => (
                      <div 
                        key={task.id} 
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border min-w-0 ${
                          task.status === 'completed' || task.progress === 100 
                            ? 'bg-emerald-500/5 border-emerald-500/20' 
                            : task.status === 'cancelled' || task.status === 'failed'
                            ? 'bg-destructive/5 border-destructive/20'
                            : 'bg-card/40 border-border/30'
                        }`}
                      >
                        {/* Status Icon */}
                        {task.status === 'completed' || task.progress === 100 ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        ) : task.status === 'cancelled' ? (
                          <XCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                        ) : task.status === 'failed' ? (
                          <XCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                        ) : task.status === 'active' || task.status === 'pending' ? (
                          <Activity className="w-3 h-3 text-primary flex-shrink-0" />
                        ) : (
                          <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        )}
                        
                        {/* Task Name */}
                        <span className="text-[10px] font-medium truncate flex-1 min-w-0">{task.name}</span>
                        
                        {/* Stats */}
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground flex-shrink-0">
                          <span className="text-emerald-500">{task.sessionsCompleted}</span>
                          {task.sessionsFailed > 0 && (
                            <span className="text-destructive">/{task.sessionsFailed}</span>
                          )}
                          <span>/{task.sessionsTotal}</span>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center flex-shrink-0">
                          {/* Restart */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRestartTask(task.id)}
                            className="h-5 w-5 p-0 hover:bg-primary/10 hover:text-primary"
                            title="Restart"
                          >
                            <RotateCw className="w-2.5 h-2.5" />
                          </Button>
                          {/* Delete */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTask(task.id)}
                            className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

                {/* Action screenshot messages - compact visual feedback */}
                {msg.type === 'action_screenshot' && msg.imageUrl && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    </div>
                    <div className="max-w-sm">
                      <ChatScreenshot
                        imageUrl={msg.imageUrl}
                        profileName={msg.profileName}
                        timestamp={msg.timestamp}
                        action={msg.actionName}
                      />
                    </div>
                  </div>
                )}

                {/* Regular messages */}
                {msg.type !== 'planning' && msg.type !== 'supervisor' && msg.type !== 'action_screenshot' && (
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
              {chatMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCurrentSession}
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
    </div>
  );
};

export default Operator;
