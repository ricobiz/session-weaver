import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Eye, 
  Play, 
  Pause, 
  RotateCcw, 
  ExternalLink, 
  Shield, 
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Clock,
  Activity,
  User
} from 'lucide-react';

interface LiveSessionViewProps {
  session: {
    id: string;
    status: string;
    progress: number;
    current_step: number;
    total_steps: number;
    current_url?: string;
    last_screenshot_url?: string;
    captcha_status?: string;
    captcha_detected_at?: string;
    captcha_resolved_at?: string;
    profile_state?: string;
    error_message?: string;
    is_resumable?: boolean;
    profiles?: { name: string } | null;
    scenarios?: { name: string } | null;
  };
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
}

const STATUS_CONFIG = {
  idle: { color: 'bg-muted', text: 'Idle', icon: Clock },
  queued: { color: 'bg-blue-500/20 text-blue-400', text: 'Queued', icon: Clock },
  running: { color: 'bg-yellow-500/20 text-yellow-400', text: 'Running', icon: Activity },
  paused: { color: 'bg-orange-500/20 text-orange-400', text: 'Paused', icon: Pause },
  success: { color: 'bg-green-500/20 text-green-400', text: 'Success', icon: CheckCircle2 },
  error: { color: 'bg-red-500/20 text-red-400', text: 'Error', icon: AlertTriangle },
  cancelled: { color: 'bg-muted', text: 'Cancelled', icon: Clock },
};

const CAPTCHA_STATUS_CONFIG = {
  detected: { color: 'bg-orange-500/20 text-orange-400', text: 'Detected', icon: AlertTriangle },
  solving: { color: 'bg-blue-500/20 text-blue-400', text: 'Solving...', icon: Loader2 },
  solved: { color: 'bg-green-500/20 text-green-400', text: 'Solved', icon: CheckCircle2 },
  failed: { color: 'bg-red-500/20 text-red-400', text: 'Failed', icon: AlertTriangle },
};

const PROFILE_STATE_CONFIG = {
  unknown: { color: 'text-muted-foreground', text: 'Unknown' },
  logged_out: { color: 'text-orange-400', text: 'Logged Out' },
  logging_in: { color: 'text-blue-400', text: 'Logging In' },
  logged_in: { color: 'text-green-400', text: 'Logged In' },
  registration_required: { color: 'text-yellow-400', text: 'Registration Required' },
  registering: { color: 'text-blue-400', text: 'Registering' },
};

export function LiveSessionView({ session, onPause, onResume, onRetry }: LiveSessionViewProps) {
  const [showScreenshot, setShowScreenshot] = useState(true);

  const statusConfig = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.idle;
  const StatusIcon = statusConfig.icon;

  const captchaConfig = session.captcha_status 
    ? CAPTCHA_STATUS_CONFIG[session.captcha_status as keyof typeof CAPTCHA_STATUS_CONFIG]
    : null;

  const profileStateConfig = PROFILE_STATE_CONFIG[session.profile_state as keyof typeof PROFILE_STATE_CONFIG] 
    || PROFILE_STATE_CONFIG.unknown;

  const isRunning = session.status === 'running';
  const isPaused = session.status === 'paused';
  const isFailed = session.status === 'error';
  const hasCaptcha = session.captcha_status && session.captcha_status !== 'solved';

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4 text-primary" />
            Live Session
          </CardTitle>
          <Badge className={statusConfig.color}>
            <StatusIcon className={`w-3 h-3 mr-1 ${session.status === 'running' ? 'animate-pulse' : ''}`} />
            {statusConfig.text}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Session Info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Profile:</span>
            <span className="font-medium">{session.profiles?.name || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Scenario:</span>
            <span className="font-medium truncate">{session.scenarios?.name || 'Unknown'}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono">
              Step {session.current_step}/{session.total_steps} ({session.progress}%)
            </span>
          </div>
          <Progress value={session.progress} className="h-2" />
        </div>

        {/* Current URL */}
        {session.current_url && (
          <div className="flex items-center gap-2 p-2 rounded bg-muted/30 text-xs">
            <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="truncate font-mono text-muted-foreground">{session.current_url}</span>
          </div>
        )}

        {/* Profile State */}
        <div className="flex items-center gap-2 text-xs">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Profile State:</span>
          <span className={profileStateConfig.color}>{profileStateConfig.text}</span>
        </div>

        {/* Captcha Status */}
        {captchaConfig && (
          <div className="p-2 rounded bg-muted/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium">Captcha</span>
              </div>
              <Badge className={captchaConfig.color}>
                {captchaConfig.icon === Loader2 ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <captchaConfig.icon className="w-3 h-3 mr-1" />
                )}
                {captchaConfig.text}
              </Badge>
            </div>
            {session.captcha_detected_at && (
              <p className="text-[10px] text-muted-foreground">
                Detected: {new Date(session.captcha_detected_at).toLocaleTimeString()}
                {session.captcha_resolved_at && (
                  <> • Resolved: {new Date(session.captcha_resolved_at).toLocaleTimeString()}</>
                )}
              </p>
            )}
          </div>
        )}

        {/* Error Message */}
        {session.error_message && (
          <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-destructive font-medium">Error</p>
                <p className="text-[10px] text-muted-foreground">{session.error_message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Screenshot Placeholder */}
        {showScreenshot && (
          <div className="rounded border border-border bg-muted/20 aspect-video flex items-center justify-center">
            {session.last_screenshot_url ? (
              <img 
                src={session.last_screenshot_url} 
                alt="Session screenshot" 
                className="w-full h-full object-contain rounded"
              />
            ) : (
              <div className="text-center text-muted-foreground">
                <Eye className="w-6 h-6 mx-auto mb-1 opacity-50" />
                <p className="text-xs">Screenshot preview</p>
                <p className="text-[10px]">(Available during execution)</p>
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {isRunning && onPause && (
            <Button size="sm" variant="outline" onClick={onPause} className="flex-1 gap-1">
              <Pause className="w-3 h-3" />
              Pause
            </Button>
          )}
          {isPaused && onResume && (
            <Button size="sm" onClick={onResume} className="flex-1 gap-1">
              <Play className="w-3 h-3" />
              Resume
            </Button>
          )}
          {isFailed && session.is_resumable && onRetry && (
            <Button size="sm" onClick={onRetry} className="flex-1 gap-1">
              <RotateCcw className="w-3 h-3" />
              Retry
            </Button>
          )}
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setShowScreenshot(!showScreenshot)}
            className="gap-1"
          >
            <Eye className="w-3 h-3" />
            {showScreenshot ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
