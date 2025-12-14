import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Target, 
  Play, 
  Pause, 
  CheckCircle2, 
  Clock,
  AlertTriangle,
  Eye,
  Square,
  Loader2
} from 'lucide-react';

interface Task {
  id: string;
  name: string;
  description?: string;
  target_platform: string;
  goal_type: string;
  status: string;
  sessions_created: number;
  sessions_completed: number;
  sessions_failed: number;
  created_at: string;
  started_at?: string;
}

interface TaskListProps {
  tasks: Task[];
  selectedTaskId?: string;
  onSelectTask: (taskId: string) => void;
  onStartTask?: (taskId: string) => void;
  onPauseTask?: (taskId: string) => void;
  onResumeTask?: (taskId: string) => void;
  onStopTask?: (taskId: string) => void;
  loadingTaskId?: string;
}

const STATUS_CONFIG = {
  draft: { color: 'bg-muted text-muted-foreground', text: 'Draft', icon: Clock },
  active: { color: 'bg-green-500/20 text-green-400', text: 'Running', icon: Loader2 },
  paused: { color: 'bg-orange-500/20 text-orange-400', text: 'Paused', icon: Pause },
  completed: { color: 'bg-blue-500/20 text-blue-400', text: 'Completed', icon: CheckCircle2 },
  stopped: { color: 'bg-red-500/20 text-red-400', text: 'Stopped', icon: Square },
};

const GOAL_COLORS = {
  play: 'text-blue-400',
  like: 'text-pink-400',
  comment: 'text-purple-400',
  mix: 'text-cyan-400',
};

export function TaskList({ 
  tasks, 
  selectedTaskId, 
  onSelectTask,
  onStartTask,
  onPauseTask,
  onResumeTask,
  onStopTask,
  loadingTaskId
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
        <Target className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No tasks yet</p>
        <p className="text-xs">Create a task below to start</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[280px]">
      <div className="space-y-2 pr-3">
        {tasks.map((task) => {
          const config = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft;
          const StatusIcon = config.icon;
          const totalSessions = task.sessions_created || 0;
          const completedSessions = (task.sessions_completed || 0) + (task.sessions_failed || 0);
          const progress = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
          const isSelected = selectedTaskId === task.id;
          const goalColor = GOAL_COLORS[task.goal_type as keyof typeof GOAL_COLORS] || 'text-muted-foreground';
          const isLoading = loadingTaskId === task.id;
          const runningSessions = totalSessions - completedSessions;

          return (
            <div
              key={task.id}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                isSelected 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-muted-foreground/50 bg-card/50'
              }`}
              onClick={() => onSelectTask(task.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">{task.name}</h4>
                    <Badge className={`${config.color} text-[10px] px-1.5`}>
                      <StatusIcon className={`w-2.5 h-2.5 mr-0.5 ${task.status === 'active' ? 'animate-spin' : ''}`} />
                      {config.text}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Session counts */}
              <div className="grid grid-cols-4 gap-1 text-[10px] mb-2">
                <div className="text-center p-1 rounded bg-muted/30">
                  <div className="font-mono font-medium">{totalSessions}</div>
                  <div className="text-muted-foreground">Total</div>
                </div>
                <div className="text-center p-1 rounded bg-green-500/10">
                  <div className="font-mono font-medium text-green-400">{task.sessions_completed || 0}</div>
                  <div className="text-muted-foreground">Done</div>
                </div>
                <div className="text-center p-1 rounded bg-red-500/10">
                  <div className="font-mono font-medium text-red-400">{task.sessions_failed || 0}</div>
                  <div className="text-muted-foreground">Failed</div>
                </div>
                <div className="text-center p-1 rounded bg-yellow-500/10">
                  <div className="font-mono font-medium text-yellow-400">{runningSessions > 0 ? runningSessions : 0}</div>
                  <div className="text-muted-foreground">Active</div>
                </div>
              </div>

              {/* Progress bar */}
              {totalSessions > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground capitalize">{task.target_platform} • <span className={goalColor}>{task.goal_type}</span></span>
                    <span className="font-mono">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}

              {/* Action buttons when selected */}
              {isSelected && (
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-border">
                  {task.status === 'draft' && onStartTask && (
                    <Button 
                      size="sm" 
                      variant="default"
                      className="h-6 text-[10px] gap-1 flex-1"
                      onClick={(e) => { e.stopPropagation(); onStartTask(task.id); }}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
                      Start
                    </Button>
                  )}
                  {task.status === 'active' && onPauseTask && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-6 text-[10px] gap-1 flex-1"
                      onClick={(e) => { e.stopPropagation(); onPauseTask(task.id); }}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Pause className="w-2.5 h-2.5" />}
                      Pause
                    </Button>
                  )}
                  {task.status === 'paused' && onResumeTask && (
                    <Button 
                      size="sm" 
                      variant="default"
                      className="h-6 text-[10px] gap-1 flex-1"
                      onClick={(e) => { e.stopPropagation(); onResumeTask(task.id); }}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
                      Resume
                    </Button>
                  )}
                  {(task.status === 'active' || task.status === 'paused') && onStopTask && (
                    <Button 
                      size="sm" 
                      variant="destructive"
                      className="h-6 text-[10px] gap-1"
                      onClick={(e) => { e.stopPropagation(); onStopTask(task.id); }}
                      disabled={isLoading}
                    >
                      <Square className="w-2.5 h-2.5" />
                      Stop
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-6 text-[10px] gap-1"
                    onClick={(e) => { e.stopPropagation(); onSelectTask(task.id); }}
                  >
                    <Eye className="w-2.5 h-2.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
