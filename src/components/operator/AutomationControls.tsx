import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AutomationControlsProps {
  hasActiveTasks: boolean;
  isPaused?: boolean;
}

export function AutomationControls({ hasActiveTasks, isPaused = false }: AutomationControlsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePause = async () => {
    setIsLoading(true);
    try {
      await supabase
        .from('sessions')
        .update({ status: 'paused' })
        .eq('status', 'running');
      toast({ title: 'Пауза' });
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async () => {
    setIsLoading(true);
    try {
      await supabase
        .from('sessions')
        .update({ status: 'queued' })
        .eq('status', 'paused');
      toast({ title: 'Продолжено' });
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .in('status', ['running', 'queued', 'paused']);
      toast({ title: 'Остановлено' });
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasActiveTasks) return null;

  return (
    <div className="flex items-center justify-center gap-1 py-1.5">
      {isPaused ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResume}
          disabled={isLoading}
          className="h-6 w-6 p-0 rounded-full bg-success/20 text-success hover:bg-success/30"
          title="Продолжить"
        >
          <Play className="w-3 h-3" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePause}
          disabled={isLoading}
          className="h-6 w-6 p-0 rounded-full bg-warning/20 text-warning hover:bg-warning/30"
          title="Пауза"
        >
          <Pause className="w-3 h-3" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleStop}
        disabled={isLoading}
        className="h-6 w-6 p-0 rounded-full bg-destructive/20 text-destructive hover:bg-destructive/30"
        title="Стоп"
      >
        <Square className="w-3 h-3" />
      </Button>
    </div>
  );
}
