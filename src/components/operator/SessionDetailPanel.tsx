import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  X, 
  Camera, 
  Pause, 
  Play, 
  User,
  Shield,
  AlertTriangle,
  Loader2,
  Server,
  RefreshCw,
  ImageOff,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface SessionDetailPanelProps {
  session: {
    id: string;
    status: string;
    progress: number;
    current_step: number;
    total_steps: number;
    runner_id?: string;
    captcha_status?: string;
    captcha_detected_at?: string;
    profile_state?: string;
    error_message?: string;
    last_screenshot_url?: string;
    current_url?: string;
    profiles?: { name: string } | null;
    current_action?: string;
  };
  onClose: () => void;
  onRefresh?: () => void;
}

const STATUS_BADGES = {
  queued: { label: 'Queued', variant: 'secondary' as const },
  running: { label: 'Running', variant: 'default' as const },
  paused: { label: 'Paused', variant: 'outline' as const },
  success: { label: 'Complete', variant: 'default' as const },
  error: { label: 'Failed', variant: 'destructive' as const },
};

const PROFILE_STATES: Record<string, string> = {
  unknown: 'Checking...',
  logged_out: 'Not logged in',
  logging_in: 'Logging in',
  logged_in: 'Logged in',
  registration_required: 'Needs signup',
  registering: 'Registering',
};

const ACTION_LABELS: Record<string, string> = {
  open: 'Opening page',
  play: 'Playing content',
  scroll: 'Scrolling',
  click: 'Clicking',
  like: 'Liking',
  comment: 'Commenting',
  wait: 'Waiting',
};

export function SessionDetailPanel({ session, onClose, onRefresh }: SessionDetailPanelProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(session.last_screenshot_url || null);
  const [screenshotTime, setScreenshotTime] = useState<string | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [pollingForScreenshot, setPollingForScreenshot] = useState(false);

  const statusBadge = STATUS_BADGES[session.status as keyof typeof STATUS_BADGES] || STATUS_BADGES.queued;
  const isRunning = session.status === 'running';
  const isPaused = session.status === 'paused';
  const hasCaptcha = session.captcha_status && !['solved', null].includes(session.captcha_status);

  useEffect(() => {
    if (session.last_screenshot_url && session.last_screenshot_url !== screenshot) {
      setScreenshot(session.last_screenshot_url);
    }
  }, [session.last_screenshot_url]);

  useEffect(() => {
    if (!pollingForScreenshot) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/sessions/${session.id}/screenshot`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.screenshot_url && data.screenshot_url !== screenshot) {
            setScreenshot(data.screenshot_url);
            setScreenshotTime(data.captured_at ? new Date(data.captured_at).toLocaleTimeString() : null);
            setPollingForScreenshot(false);
            setIsCapturing(false);
          }
        }
      } catch (err) {
        console.error('Screenshot poll error:', err);
      }
    }, 1500);

    const timeout = setTimeout(() => {
      setPollingForScreenshot(false);
      setIsCapturing(false);
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [pollingForScreenshot, session.id, screenshot]);

  const handleScreenshot = async () => {
    setIsCapturing(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/sessions/${session.id}/screenshot`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) throw new Error('Failed to request screenshot');

      const data = await response.json();
      
      if (data.status === 'requested') {
        setPollingForScreenshot(true);
        toast({ title: 'Capturing screenshot...' });
      } else if (data.screenshot_url) {
        setScreenshot(data.screenshot_url);
        setIsCapturing(false);
      } else {
        setIsCapturing(false);
        toast({ title: 'No screenshot available', variant: 'destructive' });
      }
    } catch (error) {
      setIsCapturing(false);
      if (session.last_screenshot_url) {
        setScreenshot(session.last_screenshot_url);
      }
      toast({ title: 'Screenshot unavailable', variant: 'destructive' });
    }
  };

  const handlePause = async () => {
    setIsActioning(true);
    try {
      await supabase.from('sessions').update({ status: 'paused' }).eq('id', session.id);
      toast({ title: 'Session paused' });
      onRefresh?.();
    } catch {
      toast({ title: 'Failed to pause', variant: 'destructive' });
    } finally {
      setIsActioning(false);
    }
  };

  const handleResume = async () => {
    setIsActioning(true);
    try {
      await supabase.from('sessions').update({ status: 'queued' }).eq('id', session.id);
      toast({ title: 'Session resumed' });
      onRefresh?.();
    } catch {
      toast({ title: 'Failed to resume', variant: 'destructive' });
    } finally {
      setIsActioning(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-card/80 backdrop-blur">
      <CardHeader className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <span className="font-medium">{session.profiles?.name || 'Session'}</span>
            <Badge variant={statusBadge.variant} className="text-[10px] h-5">
              {statusBadge.label}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-0 space-y-4">
        {/* Current Activity */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2 text-sm">
            {isRunning && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            {isPaused && <Pause className="w-4 h-4 text-warning" />}
            <span className="font-medium">
              {isRunning 
                ? (ACTION_LABELS[session.current_action || ''] || 'Processing...')
                : statusBadge.label
              }
            </span>
          </div>
          {session.runner_id && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <Server className="w-3 h-3" />
              Worker #{session.runner_id.slice(-4)}
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono font-medium">{session.progress}%</span>
          </div>
          <Progress value={session.progress} className="h-2" />
          <div className="text-xs text-muted-foreground text-right">
            Step {session.current_step} of {session.total_steps}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-muted/20">
            <div className="text-muted-foreground mb-0.5">Account</div>
            <div className="font-medium">{PROFILE_STATES[session.profile_state || 'unknown']}</div>
          </div>
          <div className="p-2 rounded bg-muted/20">
            <div className="text-muted-foreground mb-0.5">Captcha</div>
            <div className="font-medium flex items-center gap-1">
              {hasCaptcha ? (
                <>
                  <Shield className="w-3 h-3 text-warning" />
                  <span className="text-warning">Solving...</span>
                </>
              ) : (
                <span className="text-success">Clear</span>
              )}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {session.error_message && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Error detected. System will retry automatically.</span>
            </div>
          </div>
        )}

        {/* Screenshot */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Camera className="w-3 h-3" />
              Screenshot
            </span>
            {screenshotTime && (
              <span className="font-mono text-[10px] text-muted-foreground/60">{screenshotTime}</span>
            )}
          </div>
          <div className="relative rounded-lg border border-border/50 overflow-hidden aspect-video bg-muted/20">
            {screenshot ? (
              <img 
                src={screenshot} 
                alt="Session screenshot" 
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <ImageOff className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <span className="text-xs text-muted-foreground/60">No screenshot yet</span>
              </div>
            )}
            {(isCapturing || pollingForScreenshot) && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
          </div>
        </div>

        {/* Current URL */}
        {session.current_url && (
          <a 
            href={session.current_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 rounded bg-muted/20 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{session.current_url}</span>
          </a>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleScreenshot}
            disabled={isCapturing}
            className="flex-1"
          >
            {isCapturing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span className="ml-1.5">Screenshot</span>
          </Button>

          {isRunning && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={handlePause}
              disabled={isActioning}
              className="flex-1"
            >
              <Pause className="w-4 h-4" />
              <span className="ml-1.5">Pause</span>
            </Button>
          )}

          {isPaused && (
            <Button 
              size="sm"
              onClick={handleResume}
              disabled={isActioning}
              className="flex-1"
            >
              <Play className="w-4 h-4" />
              <span className="ml-1.5">Resume</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
