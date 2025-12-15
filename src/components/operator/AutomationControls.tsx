import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, RotateCcw, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AutomationControlsProps {
  hasActiveTasks: boolean;
  isProcessing: boolean;
  onRequestScreenshot: () => void;
}

export function AutomationControls({ 
  hasActiveTasks, 
  isProcessing,
  onRequestScreenshot 
}: AutomationControlsProps) {
  const [isPausing, setIsPausing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  const handlePause = async () => {
    setIsPausing(true);
    try {
      // Pause all running sessions
      await supabase
        .from('sessions')
        .update({ status: 'paused' })
        .eq('status', 'running');
      toast({ title: 'Автоматизация приостановлена' });
    } catch (err) {
      toast({ title: 'Ошибка паузы', variant: 'destructive' });
    } finally {
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    setIsPausing(true);
    try {
      // Resume paused sessions
      await supabase
        .from('sessions')
        .update({ status: 'queued' })
        .eq('status', 'paused');
      toast({ title: 'Автоматизация возобновлена' });
    } catch (err) {
      toast({ title: 'Ошибка возобновления', variant: 'destructive' });
    } finally {
      setIsPausing(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      // Cancel all active sessions
      await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .in('status', ['running', 'queued', 'paused']);
      toast({ title: 'Все задачи остановлены' });
    } catch (err) {
      toast({ title: 'Ошибка остановки', variant: 'destructive' });
    } finally {
      setIsStopping(false);
    }
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      // Restart failed/cancelled sessions
      await supabase
        .from('sessions')
        .update({ status: 'queued', retry_count: 0, error_message: null })
        .in('status', ['error', 'cancelled']);
      toast({ title: 'Задачи перезапущены' });
    } catch (err) {
      toast({ title: 'Ошибка перезапуска', variant: 'destructive' });
    } finally {
      setIsRestarting(false);
    }
  };

  // Always show when processing or has messages in context
  const showControls = hasActiveTasks || isProcessing;

  if (!showControls) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 py-2">
      {/* Play/Resume */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleResume}
        disabled={isPausing}
        className="h-7 px-3 rounded-full bg-success/10 text-success hover:bg-success/20 hover:text-success border border-success/20"
        title="Возобновить"
      >
        <Play className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">Play</span>
      </Button>

      {/* Pause */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePause}
        disabled={isPausing}
        className="h-7 px-3 rounded-full bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning border border-warning/20"
        title="Пауза"
      >
        <Pause className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">Pause</span>
      </Button>

      {/* Stop */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleStop}
        disabled={isStopping}
        className="h-7 px-3 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive border border-destructive/20"
        title="Остановить"
      >
        <Square className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">Stop</span>
      </Button>

      {/* Restart */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRestart}
        disabled={isRestarting}
        className="h-7 px-3 rounded-full bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary border border-primary/20"
        title="Перезапустить"
      >
        <RotateCcw className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">Restart</span>
      </Button>

      {/* Screenshot */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRequestScreenshot}
        className="h-7 px-3 rounded-full bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent border border-accent/20"
        title="Скриншот"
      >
        <Camera className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">Screenshot</span>
      </Button>
    </div>
  );
}
