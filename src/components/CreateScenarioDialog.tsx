import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateScenario } from '@/hooks/useSessionData';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface CreateScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EXAMPLE_STEPS = `[
  { "action": "open", "target": "https://music.example.com/discover" },
  { "action": "scroll", "randomized": true },
  { "action": "play", "duration": 120 },
  { "action": "like" },
  { "action": "comment", "text": "Great track!" }
]`;

export function CreateScenarioDialog({ open, onOpenChange }: CreateScenarioDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stepsJson, setStepsJson] = useState(EXAMPLE_STEPS);

  const createScenario = useCreateScenario();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Scenario name is required.',
        variant: 'destructive'
      });
      return;
    }

    let steps;
    try {
      steps = JSON.parse(stepsJson);
      if (!Array.isArray(steps)) {
        throw new Error('Steps must be an array');
      }
    } catch (error) {
      toast({
        title: 'Invalid JSON',
        description: 'Steps must be valid JSON array.',
        variant: 'destructive'
      });
      return;
    }

    // Estimate duration from steps
    const estimatedDuration = steps.reduce((sum: number, step: any) => {
      if (step.duration) return sum + step.duration;
      if (step.action === 'scroll') return sum + 5;
      if (step.action === 'like' || step.action === 'click') return sum + 2;
      if (step.action === 'comment') return sum + 10;
      if (step.action === 'open') return sum + 5;
      return sum + 3;
    }, 0);

    try {
      await createScenario.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        steps,
        estimated_duration_seconds: estimatedDuration,
        tags: [],
        last_run_at: null,
        run_count: 0,
        success_rate: 0,
        avg_duration_ms: null,
        is_valid: true,
        validation_errors: [],
      });

      toast({
        title: 'Scenario Created',
        description: `Scenario "${name}" with ${steps.length} steps has been created.`
      });

      setName('');
      setDescription('');
      setStepsJson(EXAMPLE_STEPS);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create scenario.',
        variant: 'destructive'
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Scenario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Scenario Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Music Discovery Flow"
              className="bg-muted/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Simulates a user discovering new music..."
              className="bg-muted/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="steps">Steps (JSON)</Label>
            <Textarea
              id="steps"
              value={stepsJson}
              onChange={(e) => setStepsJson(e.target.value)}
              className="bg-muted/50 font-mono text-xs h-[200px]"
              placeholder="Enter steps as JSON array..."
            />
            <p className="text-xs text-muted-foreground">
              Supported actions: open, play, scroll, click, like, comment, wait
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createScenario.isPending}>
              {createScenario.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
