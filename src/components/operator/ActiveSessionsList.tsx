import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Pause,
  Loader2,
  User,
  Shield,
} from 'lucide-react';

interface Session {
  id: string;
  status: string;
  progress: number;
  current_step: number;
  total_steps: number;
  runner_id?: string;
  captcha_status?: string;
  profiles?: { name: string } | null;
  current_action?: string;
}

interface ActiveSessionsListProps {
  sessions: Session[];
  onSessionClick?: (sessionId: string) => void;
  selectedSessionId?: string;
}

const STATUS_CONFIG = {
  queued: { label: 'Waiting', icon: Clock, dotColor: 'bg-muted-foreground' },
  running: { label: 'Working', icon: Activity, dotColor: 'bg-primary' },
  paused: { label: 'Paused', icon: Pause, dotColor: 'bg-warning' },
  success: { label: 'Done', icon: CheckCircle2, dotColor: 'bg-success' },
  error: { label: 'Failed', icon: AlertTriangle, dotColor: 'bg-destructive' },
  idle: { label: 'Idle', icon: Clock, dotColor: 'bg-muted-foreground' },
  cancelled: { label: 'Stopped', icon: Clock, dotColor: 'bg-muted-foreground' },
} as const;

const ACTION_LABELS: Record<string, string> = {
  open: 'Opening page',
  play: 'Playing',
  scroll: 'Scrolling',
  click: 'Clicking',
  like: 'Liking',
  comment: 'Commenting',
  wait: 'Waiting',
};

export function ActiveSessionsList({ 
  sessions, 
  onSessionClick, 
  selectedSessionId 
}: ActiveSessionsListProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-3">
          <User className="w-5 h-5" />
        </div>
        <p className="text-sm">No active workers</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Sessions will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const config = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.idle;
        const isSelected = selectedSessionId === session.id;
        const hasCaptcha = session.captcha_status && !['solved', null].includes(session.captcha_status);
        const isRunning = session.status === 'running';

        return (
          <div 
            key={session.id}
            onClick={() => onSessionClick?.(session.id)}
            className={`
              group p-3 rounded-lg cursor-pointer transition-all duration-200
              ${isSelected 
                ? 'bg-primary/10 ring-1 ring-primary/50' 
                : 'bg-muted/20 hover:bg-muted/40'
              }
            `}
          >
            {/* Header Row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full ${config.dotColor} ${isRunning ? 'animate-pulse' : ''}`} />
                <span className="text-sm font-medium truncate">
                  {session.profiles?.name || 'Worker'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {hasCaptcha && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 text-warning border-warning/40 bg-warning/10">
                    <Shield className="w-2.5 h-2.5" />
                  </Badge>
                )}
                {session.runner_id && (
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    #{session.runner_id.slice(-4)}
                  </span>
                )}
              </div>
            </div>

            {/* Status Row */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              {isRunning ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span>{ACTION_LABELS[session.current_action || ''] || 'Processing...'}</span>
                </>
              ) : (
                <>
                  <config.icon className="w-3 h-3" />
                  <span>{config.label}</span>
                </>
              )}
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <Progress value={session.progress} className="h-1 flex-1" />
              <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
                {session.current_step}/{session.total_steps}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
