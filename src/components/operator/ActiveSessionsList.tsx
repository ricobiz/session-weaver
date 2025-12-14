import { Card, CardContent } from '@/components/ui/card';
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

const STATUS_DISPLAY = {
  queued: { label: 'Waiting', icon: Clock, color: 'text-muted-foreground' },
  running: { label: 'Working', icon: Activity, color: 'text-primary' },
  paused: { label: 'Paused', icon: Pause, color: 'text-warning' },
  success: { label: 'Done', icon: CheckCircle2, color: 'text-success' },
  error: { label: 'Failed', icon: AlertTriangle, color: 'text-destructive' },
  idle: { label: 'Idle', icon: Clock, color: 'text-muted-foreground' },
  cancelled: { label: 'Stopped', icon: Clock, color: 'text-muted-foreground' },
} as const;

// Human-readable action descriptions
const ACTION_LABELS: Record<string, string> = {
  open: 'Opening page',
  play: 'Playing content',
  scroll: 'Scrolling',
  click: 'Clicking element',
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
      <div className="text-center py-6 text-muted-foreground text-sm">
        No active sessions
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const statusInfo = STATUS_DISPLAY[session.status as keyof typeof STATUS_DISPLAY] 
          || STATUS_DISPLAY.idle;
        const StatusIcon = statusInfo.icon;
        const isSelected = selectedSessionId === session.id;
        const hasCaptcha = session.captcha_status && 
          !['solved', null].includes(session.captcha_status);

        return (
          <Card 
            key={session.id}
            className={`cursor-pointer transition-colors hover:bg-muted/30 ${
              isSelected ? 'ring-1 ring-primary bg-muted/20' : ''
            }`}
            onClick={() => onSessionClick?.(session.id)}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                {/* Profile & Status */}
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium truncate max-w-[120px]">
                    {session.profiles?.name || 'Profile'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasCaptcha && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 text-warning border-warning/30">
                      <Shield className="w-2.5 h-2.5" />
                      Captcha
                    </Badge>
                  )}
                  <StatusIcon className={`w-4 h-4 ${statusInfo.color} ${
                    session.status === 'running' ? 'animate-pulse' : ''
                  }`} />
                </div>
              </div>

              {/* Current Action */}
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                {session.status === 'running' && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                <span>
                  {session.status === 'running' 
                    ? (ACTION_LABELS[session.current_action || ''] || 'Processing...')
                    : statusInfo.label
                  }
                </span>
                {session.runner_id && (
                  <span className="ml-auto text-[10px] font-mono opacity-50">
                    W{session.runner_id.slice(-4)}
                  </span>
                )}
              </div>

              {/* Progress */}
              <div className="flex items-center gap-2">
                <Progress value={session.progress} className="h-1.5 flex-1" />
                <span className="text-[10px] font-mono text-muted-foreground">
                  {session.current_step}/{session.total_steps}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
