import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Square, Settings2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface ScenarioOption {
  id: string;
  name: string;
}

interface ProfileOption {
  id: string;
  name: string;
}

interface ExecutionPanelProps {
  scenarios: ScenarioOption[];
  profiles: ProfileOption[];
}

export function ExecutionPanel({ scenarios, profiles }: ExecutionPanelProps) {
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [selectedProfile, setSelectedProfile] = useState<string>('all');
  const [concurrency, setConcurrency] = useState([3]);
  const [isStarting, setIsStarting] = useState(false);

  const queryClient = useQueryClient();

  const handleStart = async () => {
    if (!selectedScenario) {
      toast({
        title: 'Select a scenario',
        description: 'Please choose a scenario to execute.',
        variant: 'destructive',
      });
      return;
    }

    if (profiles.length === 0) {
      toast({
        title: 'No profiles',
        description: 'Create at least one profile first.',
        variant: 'destructive',
      });
      return;
    }

    setIsStarting(true);

    try {
      const profileIds = selectedProfile === 'all' 
        ? profiles.map(p => p.id)
        : [selectedProfile];

      const { data, error } = await supabase.functions.invoke('session-api', {
        body: {
          scenario_id: selectedScenario,
          profile_ids: profileIds,
          priority: 0
        }
      });

      if (error) throw error;

      toast({
        title: 'Sessions queued',
        description: `${data.created} session(s) added to execution queue.`,
      });

      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch (error) {
      console.error('Error starting sessions:', error);
      toast({
        title: 'Error',
        description: 'Failed to start sessions. Check console for details.',
        variant: 'destructive',
      });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="glass-panel rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Settings2 className="w-4 h-4 text-primary" />
        Execution Configuration
      </div>

      <div className="grid gap-4">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            Scenario
          </label>
          <Select value={selectedScenario} onValueChange={setSelectedScenario}>
            <SelectTrigger className="bg-muted/50 border-border">
              <SelectValue placeholder="Select scenario..." />
            </SelectTrigger>
            <SelectContent>
              {scenarios.length === 0 ? (
                <SelectItem value="_none" disabled>No scenarios available</SelectItem>
              ) : (
                scenarios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            Profile Selection
          </label>
          <Select value={selectedProfile} onValueChange={setSelectedProfile}>
            <SelectTrigger className="bg-muted/50 border-border">
              <SelectValue placeholder="All profiles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All profiles ({profiles.length})</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              Concurrency Limit
            </label>
            <span className="text-sm font-mono text-primary">{concurrency[0]}</span>
          </div>
          <Slider
            value={concurrency}
            onValueChange={setConcurrency}
            min={1}
            max={10}
            step={1}
            className="py-2"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button 
          onClick={handleStart} 
          className="flex-1 gap-2"
          disabled={isStarting || scenarios.length === 0 || profiles.length === 0}
        >
          {isStarting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Queue Sessions
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Sessions will be picked up by your Playwright runner
      </p>
    </div>
  );
}
