import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Square, Settings2 } from 'lucide-react';
import { Scenario, UserProfile } from '@/types/session';
import { toast } from '@/hooks/use-toast';

interface ExecutionPanelProps {
  scenarios: Scenario[];
  profiles: UserProfile[];
}

export function ExecutionPanel({ scenarios, profiles }: ExecutionPanelProps) {
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [concurrency, setConcurrency] = useState([3]);
  const [isRunning, setIsRunning] = useState(false);

  const handleStart = () => {
    if (!selectedScenario) {
      toast({
        title: 'Select a scenario',
        description: 'Please choose a scenario to execute.',
        variant: 'destructive',
      });
      return;
    }
    setIsRunning(true);
    toast({
      title: 'Sessions started',
      description: `Launching ${selectedProfiles.length || profiles.length} parallel sessions.`,
    });
  };

  const handleStop = () => {
    setIsRunning(false);
    toast({
      title: 'Sessions stopped',
      description: 'All active sessions have been terminated.',
    });
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
              {scenarios.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            Profile Selection
          </label>
          <Select>
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
        {!isRunning ? (
          <Button onClick={handleStart} className="flex-1 gap-2">
            <Play className="w-4 h-4" />
            Start Sessions
          </Button>
        ) : (
          <>
            <Button variant="secondary" className="flex-1 gap-2">
              <Pause className="w-4 h-4" />
              Pause
            </Button>
            <Button variant="destructive" onClick={handleStop} className="gap-2">
              <Square className="w-4 h-4" />
              Stop
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
