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
  Trash2
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
  onDeleteTask?: (taskId: string) => void;
}

const STATUS_CONFIG = {
  draft: { color: 'bg-muted', text: 'Draft', icon: Clock },
  active: { color: 'bg-green-500/20 text-green-400', text: 'Active', icon: Play },
  paused: { color: 'bg-orange-500/20 text-orange-400', text: 'Paused', icon: Pause },
  completed: { color: 'bg-blue-500/20 text-blue-400', text: 'Completed', icon: CheckCircle2 },
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
  onDeleteTask 
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
        <Target className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No tasks yet</p>
        <p className="text-xs">Create a task to start</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[280px]">
      <div className="space-y-2 pr-3">
        {tasks.map((task) => {
          const config = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft;
          const StatusIcon = config.icon;
          const totalSessions = task.sessions_created || 1;
          const progress = totalSessions > 0 
            ? Math.round(((task.sessions_completed + task.sessions_failed) / totalSessions) * 100) 
            : 0;
          const isSelected = selectedTaskId === task.id;
          const goalColor = GOAL_COLORS[task.goal_type as keyof typeof GOAL_COLORS] || 'text-muted-foreground';

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
                      <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                      {config.text}
                    </Badge>
                  </div>
                  {task.description && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                <span className="capitalize">{task.target_platform}</span>
                <span className="text-muted-foreground/50">•</span>
                <span className={`capitalize ${goalColor}`}>{task.goal_type}</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Sessions</span>
                  <span className="font-mono">
                    <span className="text-green-400">{task.sessions_completed}</span>
                    <span className="text-muted-foreground/50"> / </span>
                    {task.sessions_failed > 0 && (
                      <>
                        <span className="text-red-400">{task.sessions_failed}</span>
                        <span className="text-muted-foreground/50"> / </span>
                      </>
                    )}
                    <span>{task.sessions_created}</span>
                  </span>
                </div>
                <Progress value={progress} className="h-1" />
              </div>

              {isSelected && (
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-border">
                  {task.status === 'draft' && onStartTask && (
                    <Button 
                      size="sm" 
                      variant="default"
                      className="h-6 text-[10px] gap-1"
                      onClick={(e) => { e.stopPropagation(); onStartTask(task.id); }}
                    >
                      <Play className="w-2.5 h-2.5" />
                      Start
                    </Button>
                  )}
                  {task.status === 'active' && onPauseTask && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-6 text-[10px] gap-1"
                      onClick={(e) => { e.stopPropagation(); onPauseTask(task.id); }}
                    >
                      <Pause className="w-2.5 h-2.5" />
                      Pause
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-6 text-[10px] gap-1"
                    onClick={(e) => { e.stopPropagation(); onSelectTask(task.id); }}
                  >
                    <Eye className="w-2.5 h-2.5" />
                    Details
                  </Button>
                  {task.status === 'draft' && onDeleteTask && (
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
