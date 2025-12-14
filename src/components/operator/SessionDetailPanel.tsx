import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  X, 
  Camera, 
  Pause, 
  Play, 
  User, 
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Server,
  RefreshCw,
  ImageOff,
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

const STATUS_DISPLAY = {
  queued: { label: 'Waiting in queue', color: 'secondary' },
  running: { label: 'Working', color: 'default' },
  paused: { label: 'Paused', color: 'outline' },
  success: { label: 'Completed', color: 'default' },
  error: { label: 'Failed', color: 'destructive' },
} as const;

const PROFILE_STATE_LABELS: Record<string, string> = {
  unknown: 'Unknown',
  logged_out: 'Not logged in',
  logging_in: 'Logging in...',
  logged_in: 'Logged in',
  registration_required: 'Needs registration',
  registering: 'Registering...',
};

const ACTION_LABELS: Record<string, string> = {
  open: 'Opening page',
  play: 'Playing content',
  scroll: 'Scrolling page',
  click: 'Clicking element',
  like: 'Liking content',
  comment: 'Posting comment',
  wait: 'Waiting',
};

export function SessionDetailPanel({ session, onClose, onRefresh }: SessionDetailPanelProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(session.last_screenshot_url || null);
  const [screenshotTime, setScreenshotTime] = useState<string | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [pollingForScreenshot, setPollingForScreenshot] = useState(false);

  const statusInfo = STATUS_DISPLAY[session.status as keyof typeof STATUS_DISPLAY];
  const isRunning = session.status === 'running';
  const isPaused = session.status === 'paused';
  const hasCaptcha = session.captcha_status && 
    !['solved', null].includes(session.captcha_status);

  // Update screenshot when session changes
  useEffect(() => {
    if (session.last_screenshot_url && session.last_screenshot_url !== screenshot) {
      setScreenshot(session.last_screenshot_url);
    }
  }, [session.last_screenshot_url]);

  // Poll for screenshot when requested
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

    // Stop polling after 10 seconds
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
      // Request screenshot capture from runner via edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/sessions/${session.id}/screenshot`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) throw new Error('Failed to request screenshot');

      const data = await response.json();
      
      if (data.status === 'requested') {
        // Start polling for the new screenshot
        setPollingForScreenshot(true);
        toast({ title: 'Screenshot requested', description: 'Waiting for capture...' });
      } else if (data.screenshot_url) {
        // Use cached screenshot
        setScreenshot(data.screenshot_url);
        setIsCapturing(false);
        toast({ title: 'Showing last known screenshot' });
      } else {
        setIsCapturing(false);
        toast({ title: 'No screenshot available', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Screenshot request failed:', error);
      setIsCapturing(false);
      
      // Fallback: use last known screenshot
      if (session.last_screenshot_url) {
        setScreenshot(session.last_screenshot_url);
        toast({ title: 'Showing last known screenshot' });
      } else {
        toast({ title: 'Screenshot unavailable', variant: 'destructive' });
      }
    }
  };

  const handlePause = async () => {
    setIsActioning(true);
    try {
      await supabase
        .from('sessions')
        .update({ status: 'paused' })
        .eq('id', session.id);
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
      await supabase
        .from('sessions')
        .update({ status: 'queued' })
        .eq('id', session.id);
      toast({ title: 'Session resumed' });
      onRefresh?.();
    } catch {
      toast({ title: 'Failed to resume', variant: 'destructive' });
    } finally {
      setIsActioning(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            {session.profiles?.name || 'Session'}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Row */}
        <div className="flex items-center justify-between">
          <Badge variant={statusInfo?.color as any || 'secondary'}>
            {statusInfo?.label || session.status}
          </Badge>
          {session.runner_id && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Server className="w-3 h-3" />
              Worker {session.runner_id.slice(-4)}
            </div>
          )}
        </div>

        {/* Current Action */}
        <div className="p-2 rounded bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
            {isPaused && <Pause className="w-3.5 h-3.5 text-warning" />}
            <span>
              {isRunning 
                ? (ACTION_LABELS[session.current_action || ''] || 'Processing...')
                : statusInfo?.label
              }
            </span>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-mono">{session.progress}%</span>
          </div>
          <Progress value={session.progress} className="h-2" />
          <div className="text-xs text-muted-foreground text-right">
            Step {session.current_step} of {session.total_steps}
          </div>
        </div>

        {/* Profile State */}
        <div className="flex items-center gap-2 text-xs">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Account:</span>
          <span>{PROFILE_STATE_LABELS[session.profile_state || 'unknown']}</span>
        </div>

        {/* Captcha Status */}
        {hasCaptcha && (
          <div className="flex items-center gap-2 p-2 rounded bg-warning/10 text-warning text-xs">
            <Shield className="w-4 h-4" />
            <span>Captcha detected - resolving automatically</span>
          </div>
        )}

        {/* Error Message (simplified) */}
        {session.error_message && (
          <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Something went wrong. System will retry if possible.</span>
            </div>
          </div>
        )}

        {/* Screenshot */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Camera className="w-3 h-3" />
              Screenshot
            </span>
            {screenshotTime && (
              <span className="font-mono text-[10px]">{screenshotTime}</span>
            )}
          </div>
          <div className="rounded border border-border overflow-hidden aspect-video bg-muted relative">
            {screenshot ? (
              <img 
                src={screenshot} 
                alt="Session screenshot" 
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <ImageOff className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs">No screenshot available</span>
                <span className="text-[10px]">Click button below to capture</span>
              </div>
            )}
            {(isCapturing || pollingForScreenshot) && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="text-center">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                  <span className="text-xs text-muted-foreground">Capturing...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleScreenshot}
            disabled={isCapturing}
            className="flex-1 gap-1.5"
          >
            {isCapturing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
            Screenshot
          </Button>

          {isRunning && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={handlePause}
              disabled={isActioning}
              className="flex-1 gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </Button>
          )}

          {isPaused && (
            <Button 
              size="sm"
              onClick={handleResume}
              disabled={isActioning}
              className="flex-1 gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              Resume
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
