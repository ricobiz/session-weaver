import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Paperclip,
  X,
  File,
  FileImage,
  FileAudio,
  FileVideo,
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
import { RunnersPanel } from '@/components/operator/RunnersPanel';
import { AutomationControls } from '@/components/operator/AutomationControls';
import logoImage from '@/assets/logo.png';
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
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      // First, request a new screenshot from the runner
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/sessions/${sessionId}/screenshot`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );

      if (response.ok) {
        const data = await response.json();
        
        if (data.screenshot_url) {
          // Screenshot immediately available
          const { data: session } = await supabase
            .from('sessions')
            .select('profiles(name)')
            .eq('id', sessionId)
            .single();
          
          addMessage({
            type: 'screenshot',
            content: `Screenshot from ${session?.profiles?.name || 'Worker'}`,
            sessionId,
            imageUrl: data.screenshot_url,
          });
        } else if (data.status === 'requested') {
          // Screenshot requested, poll for it
          addMessage({
            type: 'system',
            content: 'Capturing screenshot...',
            sessionId,
          });
          
          // Poll for screenshot for up to 10 seconds
          let attempts = 0;
          const pollInterval = setInterval(async () => {
            attempts++;
            const { data: session } = await supabase
              .from('sessions')
              .select('last_screenshot_url, profiles(name)')
              .eq('id', sessionId)
              .single();
            
            if (session?.last_screenshot_url) {
              clearInterval(pollInterval);
              addMessage({
                type: 'screenshot',
                content: `Screenshot from ${session.profiles?.name || 'Worker'}`,
                sessionId,
                imageUrl: session.last_screenshot_url,
              });
              setLoadingScreenshots(prev => {
                const next = new Set(prev);
                next.delete(sessionId);
                return next;
              });
            } else if (attempts >= 10) {
              clearInterval(pollInterval);
              addMessage({
                type: 'system',
                content: 'Screenshot capture timed out',
                sessionId,
              });
              setLoadingScreenshots(prev => {
                const next = new Set(prev);
                next.delete(sessionId);
                return next;
              });
            }
          }, 1000);
          
          return; // Don't clear loading state yet
        } else {
          addMessage({
            type: 'system',
            content: 'No active session for screenshot',
            sessionId,
          });
        }
      } else {
        // Fallback: try to get existing screenshot
        const { data: session } = await supabase
          .from('sessions')
          .select('last_screenshot_url, profiles(name)')
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
            content: 'No screenshot available for this session',
            sessionId,
          });
        }
      }
    } catch (error) {
      console.error('Screenshot request error:', error);
      addMessage({
        type: 'error',
        content: 'Failed to capture screenshot',
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

  // File handling
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files].slice(0, 10)); // Max 10 files
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return FileImage;
    if (file.type.startsWith('audio/')) return FileAudio;
    if (file.type.startsWith('video/')) return FileVideo;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 glass-panel border-x-0 border-t-0 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Logo + Chat selector */}
          <div className="flex items-center gap-2 min-w-0">
            <img src={logoImage} alt="Logo" className="w-8 h-8 rounded-xl flex-shrink-0" />
            
            {/* Chat Sessions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5 hover:bg-muted/50 rounded-lg">
                  <MessageSquare className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate max-w-[80px] hidden sm:inline">
                    {currentSession?.name || 'Новый чат'}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 glass-panel border-border/50">
                <DropdownMenuItem onClick={() => createNewSession()} className="gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  <span>Новый чат</span>
                </DropdownMenuItem>
                {chatSessions.length > 0 && <DropdownMenuSeparator />}
                {chatSessions.slice(0, 10).map(session => (
                  <DropdownMenuItem 
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    className="flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <History className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{session.name}</span>
                      {session.id === activeSessionId && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Right: Compact Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Status Badge */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${
              systemOnline 
                ? 'bg-success/10 text-success border border-success/20' 
                : 'bg-destructive/10 text-destructive border border-destructive/20'
            }`}>
              {systemOnline ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  <span className="hidden sm:inline">Online</span>
                  <span className="text-success/60">• {onlineRunners.length}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </div>
            
            {/* Icon Buttons */}
            <Button 
              variant="ghost" 
              size="sm" 
              className={`h-8 w-8 p-0 rounded-lg hover:bg-muted/50 ${showSessionPanel ? 'bg-primary/20 text-primary' : ''}`}
              onClick={() => setShowSessionPanel(!showSessionPanel)}
              title="Потоки"
            >
              <Layers className="h-4 w-4" />
            </Button>
            
            {/* Model & Balance */}
            <OperatorBalanceHeader 
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
            />
            
            {/* Developer Mode */}
            <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0 rounded-lg hover:bg-muted/50" title="Developer Mode">
              <Link to="/dashboard">
                <Code2 className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Bar - glassmorphism */}
      <div className="flex-shrink-0 glass-panel border-t-0 px-4 py-2.5">
        <div className="flex items-center gap-4">
          {/* Quick Stats */}
          <div className="flex items-center gap-4">
            {totalRunning > 0 && (
              <div className="session-chip border-primary/30">
                <div className="status-dot status-dot-primary" />
                <span className="text-xs font-medium text-primary">{totalRunning} active</span>
              </div>
            )}
            {totalQueued > 0 && (
              <div className="session-chip">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{totalQueued} queued</span>
              </div>
            )}
            <div className="session-chip border-success/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              <span className="text-xs text-success font-medium">{totalCompleted}</span>
            </div>
            {totalFailed > 0 && (
              <div className="session-chip border-destructive/20">
                <XCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs text-destructive">{totalFailed}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Session Panel (collapsible) */}
        {showSessionPanel && (
          <div className="w-72 glass-panel border-t-0 border-l-0 flex-shrink-0 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-border/30">
              <h3 className="text-xs font-semibold text-foreground">Активные потоки</h3>
            </div>
            <RunnersPanel />
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <ScrollArea className="flex-1 scrollbar-thin" ref={scrollRef}>
            <div className="p-4 space-y-4 max-w-3xl mx-auto">

            {/* Active Tasks as glass cards */}
            {activeTasks.length > 0 && (
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" />
                  Active Tasks
                </span>
                {activeTasks.map((task) => (
                  <div key={task.id} className="task-card task-card-active">
                    <div className="flex items-center gap-3">
                      {task.status === 'paused' ? (
                        <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center">
                          <Pause className="w-4 h-4 text-warning" />
                        </div>
                      ) : task.sessionsRunning > 0 ? (
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center glow-primary">
                          <Activity className="w-4 h-4 text-primary animate-pulse" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.sessionsCompleted}/{task.sessionsTotal} completed
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {task.status === 'paused' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleResumeTask(task.id)}
                            className="h-7 w-7 p-0 rounded-lg hover:bg-success/20 hover:text-success"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePauseTask(task.id)}
                            className="h-7 w-7 p-0 rounded-lg hover:bg-warning/20 hover:text-warning"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStop(task.id)}
                          className="h-7 w-7 p-0 rounded-lg hover:bg-destructive/20 hover:text-destructive"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="progress-glass">
                      <div 
                        className="progress-glass-fill" 
                        style={{ width: `${task.progress}%` }}
                      />
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
                  className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold hover:text-muted-foreground transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                  History ({allTasks.length})
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTaskHistory ? 'rotate-180' : ''}`} />
                </button>
                
                {showTaskHistory && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                    {allTasks.map((task) => (
                      <div 
                        key={task.id} 
                        className={`glass-card p-3 flex items-center gap-3 ${
                          task.status === 'completed' || task.progress === 100 
                            ? 'border-success/30' 
                            : task.status === 'cancelled' || task.status === 'failed'
                            ? 'border-destructive/30'
                            : ''
                        }`}
                      >
                        {/* Status Icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          task.status === 'completed' || task.progress === 100 
                            ? 'bg-success/20' 
                            : task.status === 'cancelled' || task.status === 'failed'
                            ? 'bg-destructive/20'
                            : 'bg-muted/50'
                        }`}>
                          {task.status === 'completed' || task.progress === 100 ? (
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          ) : task.status === 'cancelled' || task.status === 'failed' ? (
                            <XCircle className="w-4 h-4 text-destructive" />
                          ) : (
                            <Clock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        
                        {/* Task Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{task.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {task.sessionsCompleted}/{task.sessionsTotal} completed
                            {task.sessionsFailed > 0 && (
                              <span className="text-destructive ml-1">• {task.sessionsFailed} failed</span>
                            )}
                          </p>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRestartTask(task.id)}
                            className="h-7 w-7 p-0 rounded-lg hover:bg-primary/20 hover:text-primary"
                            title="Restart"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTask(task.id)}
                            className="h-7 w-7 p-0 rounded-lg hover:bg-destructive/20 hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
              <div key={msg.id} className="animate-fade-in">
                {/* Planning message - shows TaskPlanner */}
                {msg.type === 'planning' && msg.userCommand && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 max-w-[90%]">
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
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                      <Brain className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <TaskSupervisor
                        taskId={msg.taskId}
                        taskName={msg.content}
                        onComplete={(success) => handleTaskComplete(msg.taskId!, success)}
                        onRequestInput={async (question) => {
                          return window.prompt(question) || '';
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Action screenshot messages */}
                {msg.type === 'action_screenshot' && msg.imageUrl && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-xl bg-success/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    </div>
                    <div className="max-w-md">
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
                  <div className={`flex gap-3 ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.type !== 'user' && (
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        msg.type === 'error' ? 'bg-destructive/20' :
                        msg.type === 'success' ? 'bg-success/20' :
                        msg.type === 'screenshot' ? 'bg-primary/20' :
                        msg.type === 'ai' ? 'bg-gradient-to-br from-primary/20 to-accent/20' :
                        'bg-muted/30'
                      }`}>
                        {msg.type === 'error' ? <XCircle className="w-4 h-4 text-destructive" /> :
                         msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-success" /> :
                         msg.type === 'screenshot' ? <Image className="w-4 h-4 text-primary" /> :
                         msg.type === 'ai' ? <Brain className="w-4 h-4 text-primary" /> :
                         <Sparkles className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    )}
                    
                    <div className={`max-w-[80%] ${msg.type === 'user' ? 'order-first' : ''}`}>
                      <div className={`px-4 py-3 text-sm ${
                        msg.type === 'user' 
                          ? 'chat-bubble-user' 
                          : msg.type === 'error' 
                          ? 'chat-bubble border-destructive/30 text-destructive' 
                          : msg.type === 'success' 
                          ? 'chat-bubble border-success/30 text-success' 
                          : msg.type === 'ai' 
                          ? 'chat-bubble-ai' 
                          : 'chat-bubble'
                      }`}>
                        {msg.content}
                      </div>
                      
                      {msg.imageUrl && (
                        <div className="mt-3 glass-card overflow-hidden max-w-[320px]">
                          <img 
                            src={msg.imageUrl} 
                            alt="Session screenshot" 
                            className="w-full h-auto"
                            loading="lazy"
                          />
                          <div className="p-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Session: {msg.sessionId?.slice(0, 8)}</span>
                            <a 
                              href={msg.imageUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:text-primary transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      )}
                      
                      <span className="text-[10px] text-muted-foreground/50 px-1 mt-1 block">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    {msg.type === 'user' && (
                      <div className="w-8 h-8 rounded-xl bg-primary/30 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Empty state */}
            {chatMessages.length === 0 && activeTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex items-center justify-center mb-6 animate-float glow-primary">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">Что нужно сделать?</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Опишите задачу на естественном языке. AI поймёт и выполнит.
                </p>
                <div className="flex flex-wrap gap-2 mt-6 justify-center">
                  <span className="session-chip text-xs">Открой Google</span>
                  <span className="session-chip text-xs">Воспроизведи трек на Spotify</span>
                  <span className="session-chip text-xs">Сделай скриншот YouTube</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="flex-shrink-0 glass-panel border-t-0 border-x-0 p-3">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Attached Files Preview */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2 rounded-xl bg-muted/30 border border-border/50">
                {attachedFiles.map((file, idx) => {
                  const FileIcon = getFileIcon(file);
                  return (
                    <div 
                      key={idx} 
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background/50 border border-border/30 group"
                    >
                      <FileIcon className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate max-w-[120px]">{file.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(idx)}
                        className="h-5 w-5 p-0 rounded-full opacity-60 hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Input Row */}
            <div className="flex items-end gap-2">
              {/* File Upload Button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                className="hidden"
                accept="*/*"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-11 w-11 p-0 rounded-xl hover:bg-muted/50 flex-shrink-0"
                title="Прикрепить файлы"
              >
                <Paperclip className="w-5 h-5 text-muted-foreground" />
              </Button>
              
              {/* Text Input */}
              <div className="flex-1 glass-input rounded-xl overflow-hidden">
                <Textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Опишите, что нужно сделать..."
                  className="min-h-[44px] max-h-[120px] resize-none border-0 bg-transparent text-sm py-3 px-4 focus:ring-0 focus-visible:ring-0"
                  disabled={isProcessing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                  }}
                  rows={1}
                />
              </div>
              
              {/* Send Button */}
              <Button 
                onClick={handleSubmit} 
                disabled={isProcessing || (!command.trim() && attachedFiles.length === 0)}
                className="h-11 w-11 rounded-xl p-0 flex-shrink-0 btn-gradient"
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
            
            {/* Automation Controls */}
            <AutomationControls 
              hasActiveTasks={totalRunning > 0 || totalQueued > 0}
              isProcessing={isProcessing}
              onRequestScreenshot={() => {
                // Request screenshot from first running session
                const runningSession = activeSessions.find(s => s.status === 'running');
                if (runningSession) requestScreenshot(runningSession.id);
              }}
            />
            
            {/* Bottom Actions */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-muted-foreground/50">⌘+Enter • Перетащите файлы</span>
              <div className="flex items-center gap-1">
                {chatMessages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearCurrentSession}
                    className="h-6 text-[11px] text-muted-foreground/50 hover:text-destructive px-2 rounded-lg"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Очистить
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { refetchTasks(); refetchSessions(); }}
                  className="h-6 text-[11px] text-muted-foreground/50 hover:text-foreground px-2 rounded-lg"
                >
                  <RotateCw className="w-3 h-3 mr-1" />
                  Обновить
                </Button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Operator;
