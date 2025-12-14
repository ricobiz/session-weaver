import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Send, 
  Play, 
  Loader2, 
  CheckCircle, 
  Target, 
  Users, 
  Clock,
  Zap,
  FileCode,
  RotateCcw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ParsedIntent {
  platform: string;
  goal: string;
  entry_method: 'url' | 'search';
  target: string;
  profile_count: number;
  run_count: number;  // Batch: runs per profile
  behavior: {
    min_duration: number;
    max_duration: number;
    randomize: boolean;
  };
  human_summary: string;
}

interface GeneratedTask {
  id: string;
  name: string;
  scenario: {
    id: string;
    name: string;
    steps: Array<{ action: string; target?: string; duration?: number }>;
    estimated_duration: number;
  };
}

type CommandState = 'input' | 'parsing' | 'review' | 'running' | 'complete';

interface CommandCenterProps {
  initialCommand?: string;
  onCommandUsed?: () => void;
}

export function CommandCenter({ initialCommand, onCommandUsed }: CommandCenterProps = {}) {
  const [command, setCommand] = useState(initialCommand || '');
  const [state, setState] = useState<CommandState>('input');
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null);
  const [generatedTask, setGeneratedTask] = useState<GeneratedTask | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle initial command from template
  useEffect(() => {
    if (initialCommand && initialCommand !== command) {
      setCommand(initialCommand);
      onCommandUsed?.();
    }
  }, [initialCommand]);

  const parseCommand = async () => {
    if (!command.trim()) return;
    
    setState('parsing');
    setIsProcessing(true);

    try {
      // Simple rule-based parsing (no AI needed for basic commands)
      const intent = parseIntent(command);
      setParsedIntent(intent);

      // Generate task and scenario
      const task = await createTaskFromIntent(intent);
      setGeneratedTask(task);

      setState('review');
    } catch (error) {
      toast({
        title: 'Failed to parse command',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setState('input');
    } finally {
      setIsProcessing(false);
    }
  };

  const parseIntent = (input: string): ParsedIntent => {
    const lower = input.toLowerCase();
    
    // Detect platform
    let platform = 'unknown';
    if (lower.includes('spotify')) platform = 'spotify';
    else if (lower.includes('youtube')) platform = 'youtube';
    else if (lower.includes('soundcloud')) platform = 'soundcloud';
    else if (lower.includes('tiktok')) platform = 'tiktok';

    // Detect goal
    let goal = 'play';
    if (lower.includes('like')) goal = 'like';
    else if (lower.includes('comment')) goal = 'comment';
    else if (lower.includes('follow') || lower.includes('subscribe')) goal = 'follow';
    else if (lower.includes('play') || lower.includes('listen') || lower.includes('watch')) goal = 'play';

    // Detect entry method and target
    let entry_method: 'url' | 'search' = 'search';
    let target = '';
    
    const urlMatch = input.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      entry_method = 'url';
      target = urlMatch[0];
    } else {
      // Extract search query (everything after "search for" or quoted text)
      const searchMatch = input.match(/(?:search\s+for|find|look\s+for)\s+["']?([^"']+)["']?/i);
      const quotedMatch = input.match(/["']([^"']+)["']/);
      target = searchMatch?.[1] || quotedMatch?.[1] || platform;
    }

    // Detect profile count
    let profile_count = 1;
    const countMatch = input.match(/(\d+)\s*(?:profile|agent|bot|user)/i);
    if (countMatch) {
      profile_count = parseInt(countMatch[1], 10);
    } else if (lower.includes('all profiles') || lower.includes('all agents')) {
      profile_count = -1; // -1 means all
    }

    // Detect run count (batch execution)
    let run_count = 1;
    const runMatch = input.match(/(\d+)\s*(?:time|run|iteration|repeat)/i);
    const timesMatch = input.match(/(\d+)x\b/i);
    if (runMatch) {
      run_count = parseInt(runMatch[1], 10);
    } else if (timesMatch) {
      run_count = parseInt(timesMatch[1], 10);
    } else if (lower.includes('repeat') || lower.includes('loop') || lower.includes('continuous')) {
      run_count = 5; // Default batch size
    }

    // Detect duration hints
    let min_duration = 30;
    let max_duration = 120;
    const durationMatch = input.match(/(\d+)\s*(?:second|sec|minute|min)/i);
    if (durationMatch) {
      const val = parseInt(durationMatch[1], 10);
      if (input.includes('min')) {
        min_duration = val * 60;
        max_duration = val * 60 + 60;
      } else {
        min_duration = val;
        max_duration = val + 30;
      }
    }

    // Build human summary
    const profileText = profile_count === -1 ? 'all profiles' : `${profile_count} profile${profile_count > 1 ? 's' : ''}`;
    const runText = run_count > 1 ? ` × ${run_count} runs` : '';
    const human_summary = `${goal.charAt(0).toUpperCase() + goal.slice(1)} on ${platform} via ${entry_method === 'url' ? 'direct link' : 'search'} "${target}" using ${profileText}${runText}`;

    return {
      platform,
      goal,
      entry_method,
      target,
      profile_count,
      run_count,
      behavior: {
        min_duration,
        max_duration,
        randomize: true,
      },
      human_summary,
    };
  };

  const createTaskFromIntent = async (intent: ParsedIntent): Promise<GeneratedTask> => {
    // Get profile count
    let profileIds: string[] = [];
    if (intent.profile_count === -1) {
      const { data: profiles } = await supabase.from('profiles').select('id');
      profileIds = profiles?.map(p => p.id) || [];
    } else {
      const { data: profiles } = await supabase.from('profiles').select('id').limit(intent.profile_count);
      profileIds = profiles?.map(p => p.id) || [];
    }

    if (profileIds.length === 0) {
      throw new Error('No profiles available. Create profiles first.');
    }

    // Create task via API
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: intent.human_summary.slice(0, 50),
          description: intent.human_summary,
          target_platform: intent.platform,
          entry_method: intent.entry_method,
          target_url: intent.entry_method === 'url' ? intent.target : null,
          search_query: intent.entry_method === 'search' ? intent.target : null,
          goal_type: intent.goal,
          profile_ids: profileIds,
          run_count: intent.run_count,
          behavior_config: {
            min_duration: intent.behavior.min_duration,
            max_duration: intent.behavior.max_duration,
            randomize_timing: intent.behavior.randomize,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create task');
    }

    const task = await response.json();

    // Generate scenario
    const scenarioResponse = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${task.id}/generate-scenario`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );

    if (!scenarioResponse.ok) {
      throw new Error('Failed to generate scenario');
    }

    const scenario = await scenarioResponse.json();

    return {
      id: task.id,
      name: task.name,
      scenario: {
        id: scenario.id,
        name: scenario.name,
        steps: scenario.steps || [],
        estimated_duration: scenario.estimated_duration_seconds || 60,
      },
    };
  };

  const runTask = async () => {
    if (!generatedTask) return;
    
    setState('running');
    setIsProcessing(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${generatedTask.id}/start`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) {
        throw new Error('Failed to start task');
      }

      const result = await response.json();
      
      toast({
        title: 'Task Started',
        description: `${result.created} sessions queued for execution.`,
      });

      setState('complete');
    } catch (error) {
      toast({
        title: 'Failed to start task',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setState('review');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setCommand('');
    setParsedIntent(null);
    setGeneratedTask(null);
    setState('input');
  };

  const formatAction = (step: { action: string; target?: string; duration?: number }) => {
    let desc = step.action.charAt(0).toUpperCase() + step.action.slice(1);
    if (step.target) desc += ` → ${step.target.slice(0, 40)}${step.target.length > 40 ? '...' : ''}`;
    if (step.duration) desc += ` (${step.duration}s)`;
    return desc;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Command Input */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Command Center
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Textarea
              placeholder="Tell me what you want to do...

Examples:
• Play this Spotify track with 5 profiles: https://open.spotify.com/track/...
• Search for 'Lo-Fi beats' on YouTube and play with all profiles
• Like the first result on TikTok for 'funny cats'"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={state !== 'input'}
              className="min-h-[120px] pr-12 resize-none"
            />
            {state === 'input' && (
              <Button
                size="icon"
                className="absolute bottom-3 right-3"
                onClick={parseCommand}
                disabled={!command.trim() || isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {state !== 'input' && (
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1">
              <RotateCcw className="h-3 w-3" />
              Start Over
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Parsing Indicator */}
      {state === 'parsing' && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-3 text-primary" />
            <p>Understanding your command...</p>
          </CardContent>
        </Card>
      )}

      {/* Review Panel */}
      {(state === 'review' || state === 'running' || state === 'complete') && parsedIntent && generatedTask && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              I understood this
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Human Summary */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-lg font-medium">{parsedIntent.human_summary}</p>
            </div>

            {/* Parsed Details */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Platform:</span>
                <Badge variant="outline">{parsedIntent.platform}</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Goal:</span>
                <Badge variant="outline">{parsedIntent.goal}</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Profiles:</span>
                <Badge variant="outline">{parsedIntent.profile_count === -1 ? 'All' : parsedIntent.profile_count}</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Runs:</span>
                <Badge variant={parsedIntent.run_count > 1 ? 'default' : 'outline'}>
                  {parsedIntent.run_count}×
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Duration:</span>
                <Badge variant="outline">{parsedIntent.behavior.min_duration}-{parsedIntent.behavior.max_duration}s</Badge>
              </div>
            </div>

            {/* Batch Execution Info */}
            {parsedIntent.run_count > 1 && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <RotateCcw className="h-4 w-4" />
                  Batch Execution
                </div>
                <p className="text-muted-foreground mt-1">
                  Each profile will run {parsedIntent.run_count} times = {' '}
                  <span className="font-medium text-foreground">
                    {(parsedIntent.profile_count === -1 ? '?' : parsedIntent.profile_count) as number * parsedIntent.run_count} total sessions
                  </span>
                </p>
              </div>
            )}

            <Separator />

            {/* Generated Scenario */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileCode className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Generated Scenario</span>
                <span className="text-xs text-muted-foreground">({generatedTask.scenario.steps.length} steps, ~{generatedTask.scenario.estimated_duration}s)</span>
              </div>
              <ScrollArea className="h-[150px] border rounded-lg">
                <div className="p-3 space-y-2">
                  {generatedTask.scenario.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{formatAction(step)}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Run Button */}
            {state === 'review' && (
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={runTask}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
                RUN
              </Button>
            )}

            {state === 'running' && (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Starting execution...</span>
              </div>
            )}

            {state === 'complete' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle className="h-6 w-6" />
                  <span className="font-medium">Task is running!</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Sessions are now executing in the background.
                </p>
                <Button variant="outline" onClick={reset}>
                  Run Another Command
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
