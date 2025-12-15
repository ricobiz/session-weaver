import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ChevronDown, 
  ChevronUp, 
  Play, 
  MousePointer, 
  Type, 
  ScrollText, 
  Eye, 
  MessageSquare,
  CheckCircle2,
  Loader2,
  Navigation,
  ThumbsUp,
  X
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ActionLog {
  id: string;
  action: string;
  message: string;
  timestamp: string;
  details?: {
    reasoning?: string;
    screenshot_url?: string;
    confidence?: number;
  };
}

interface TaskProgressIndicatorProps {
  sessionId: string;
  className?: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  navigate: <Navigation className="h-3.5 w-3.5" />,
  click: <MousePointer className="h-3.5 w-3.5" />,
  type: <Type className="h-3.5 w-3.5" />,
  scroll: <ScrollText className="h-3.5 w-3.5" />,
  screenshot: <Eye className="h-3.5 w-3.5" />,
  comment: <MessageSquare className="h-3.5 w-3.5" />,
  like: <ThumbsUp className="h-3.5 w-3.5" />,
  play: <Play className="h-3.5 w-3.5" />,
  complete: <CheckCircle2 className="h-3.5 w-3.5" />,
  init: <Loader2 className="h-3.5 w-3.5" />,
};

const ACTION_LABELS: Record<string, string> = {
  navigate: 'Переход',
  click: 'Клик',
  type: 'Ввод текста',
  scroll: 'Прокрутка',
  screenshot: 'Скриншот',
  comment: 'Комментарий',
  like: 'Лайк',
  play: 'Воспроизведение',
  complete: 'Завершено',
  init: 'Запуск',
};

export function TaskProgressIndicator({ sessionId, className }: TaskProgressIndicatorProps) {
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);

  // Fetch action logs for this session
  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('session_logs')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true });

      if (data) {
        const mapped = data.map(log => ({
          id: log.id,
          action: log.action || 'unknown',
          message: log.message,
          timestamp: log.timestamp,
          details: log.details as ActionLog['details'],
        }));
        setActions(mapped);
        setCurrentActionIndex(mapped.length - 1);
      }
    };

    fetchLogs();

    // Subscribe to new logs
    const channel = supabase
      .channel(`session-logs-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new as any;
        setActions(prev => {
          const newActions = [...prev, {
            id: log.id,
            action: log.action || 'unknown',
            message: log.message,
            timestamp: log.timestamp,
            details: log.details,
          }];
          setCurrentActionIndex(newActions.length - 1);
          return newActions;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const currentAction = actions[currentActionIndex];

  if (actions.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground text-xs", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Ожидание действий...</span>
      </div>
    );
  }

  return (
    <div className={cn("", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {/* Current Action - Animated */}
        <CollapsibleTrigger className="w-full">
          <div className="glass-card p-2 px-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-accent/10 transition-colors">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Animated action icon */}
              <div className="relative flex-shrink-0">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary animate-pulse">
                  {ACTION_ICONS[currentAction?.action] || <Loader2 className="h-3.5 w-3.5" />}
                </div>
                {/* Running indicator ring */}
                {currentAction?.action !== 'complete' && (
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
                )}
              </div>
              
              {/* Action text with slide animation */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div 
                  key={currentAction?.id} 
                  className="animate-fade-in"
                >
                  <span className="text-xs font-medium text-primary">
                    {ACTION_LABELS[currentAction?.action] || currentAction?.action}
                  </span>
                  <p className="text-xs text-muted-foreground truncate">
                    {currentAction?.details?.reasoning?.slice(0, 50) || currentAction?.message.slice(0, 50)}
                    {(currentAction?.details?.reasoning?.length || currentAction?.message.length) > 50 && '...'}
                  </p>
                </div>
              </div>

              {/* Progress dots */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {actions.slice(-5).map((_, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "w-1 h-1 rounded-full transition-all",
                      idx === actions.slice(-5).length - 1 
                        ? "w-1.5 h-1.5 bg-primary" 
                        : "bg-muted-foreground/40"
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Expand button */}
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-[10px]">{actions.length}</span>
              {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Action History */}
        <CollapsibleContent>
          <div className="mt-1 glass-card overflow-hidden">
            <ScrollArea className="max-h-48">
              <div className="divide-y divide-border/50">
                {actions.map((action, idx) => (
                  <div 
                    key={action.id}
                    onClick={() => action.details?.screenshot_url && setSelectedScreenshot(action.details.screenshot_url)}
                    className={cn(
                      "p-2 px-3 flex items-center gap-2 text-xs transition-colors",
                      action.details?.screenshot_url && "cursor-pointer hover:bg-accent/10",
                      idx === currentActionIndex && "bg-primary/5"
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      "w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
                      action.action === 'complete' ? "bg-success/20 text-success" :
                      action.action === 'error' ? "bg-destructive/20 text-destructive" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {ACTION_ICONS[action.action] || <Loader2 className="h-3 w-3" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">
                          {ACTION_LABELS[action.action] || action.action}
                        </span>
                        {action.details?.screenshot_url && (
                          <Eye className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-[10px]">
                        {action.details?.reasoning || action.message}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {new Date(action.timestamp).toLocaleTimeString('ru-RU', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Screenshot Dialog */}
      <Dialog open={!!selectedScreenshot} onOpenChange={() => setSelectedScreenshot(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Скриншот действия</span>
              <button 
                onClick={() => setSelectedScreenshot(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {selectedScreenshot && (
            <div className="relative">
              <img 
                src={selectedScreenshot} 
                alt="Action screenshot" 
                className="w-full rounded-lg border"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
