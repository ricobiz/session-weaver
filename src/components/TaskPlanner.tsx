import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  Play, 
  Loader2,
  Target,
  Users,
  Clock,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  Brain
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface TaskPlan {
  id: string;
  name: string;
  parsed_intent: {
    platform: string;
    goal: string;
    entry_method: 'url' | 'search';
    target: string;
    profile_count: number;
    run_count: number;
    behavior: {
      min_duration: number;
      max_duration: number;
      randomize: boolean;
    };
    human_summary: string;
  };
  validation: {
    is_valid: boolean;
    warnings: string[];
    risks: string[];
  };
  execution_mode: 'autonomous';
}

interface TaskPlannerProps {
  userCommand: string;
  onApprove: (taskId: string, plan: TaskPlan) => void;
  onCancel: () => void;
  onEdit?: (plan: TaskPlan) => void;
}

export function TaskPlanner({ userCommand, onApprove, onCancel, onEdit }: TaskPlannerProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyzePlan();
  }, [userCommand]);

  const analyzePlan = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      // Parse intent from command
      const intent = parseUserIntent(userCommand);
      
      // Get available profiles
      let profileIds: string[] = [];
      if (intent.profile_count === -1) {
        const { data: profiles } = await supabase.from('profiles').select('id');
        profileIds = profiles?.map(p => p.id) || [];
      } else {
        const { data: profiles } = await supabase.from('profiles').select('id').limit(intent.profile_count);
        profileIds = profiles?.map(p => p.id) || [];
      }

      if (profileIds.length === 0) {
        throw new Error('No profiles available. Please create profiles first.');
      }

      // Create task via API (no fixed scenario - AI will handle it)
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
              execution_mode: 'autonomous', // AI-driven execution
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create task');
      }

      const task = await response.json();

      // Validate the plan
      const validation = validatePlan(intent);

      setPlan({
        id: task.id,
        name: task.name,
        parsed_intent: intent,
        validation,
        execution_mode: 'autonomous',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze command');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const parseUserIntent = (input: string) => {
    const lower = input.toLowerCase();
    
    // Detect platform
    let platform = 'generic';
    if (lower.includes('spotify')) platform = 'spotify';
    else if (lower.includes('youtube')) platform = 'youtube';
    else if (lower.includes('soundcloud')) platform = 'soundcloud';
    else if (lower.includes('tiktok')) platform = 'tiktok';
    else if (lower.includes('instagram')) platform = 'instagram';
    else if (lower.includes('twitter') || lower.includes('x.com')) platform = 'twitter';

    // Detect goal
    let goal = 'play';
    if (lower.includes('like')) goal = 'like';
    else if (lower.includes('comment')) goal = 'comment';
    else if (lower.includes('follow') || lower.includes('subscribe')) goal = 'follow';
    else if (lower.includes('play') || lower.includes('listen') || lower.includes('watch') || lower.includes('view')) goal = 'play';
    else if (lower.includes('share')) goal = 'share';

    // Detect entry method and target
    let entry_method: 'url' | 'search' = 'search';
    let target = '';
    
    const urlMatch = input.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      entry_method = 'url';
      target = urlMatch[0];
    } else {
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
      profile_count = -1;
    }

    // Detect run count
    let run_count = 1;
    const runMatch = input.match(/(\d+)\s*(?:time|run|iteration|repeat)/i);
    const timesMatch = input.match(/(\d+)x\b/i);
    if (runMatch) {
      run_count = parseInt(runMatch[1], 10);
    } else if (timesMatch) {
      run_count = parseInt(timesMatch[1], 10);
    }

    // Duration hints
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

  const validatePlan = (intent: any): { is_valid: boolean; warnings: string[]; risks: string[] } => {
    const warnings: string[] = [];
    const risks: string[] = [];

    if (intent.platform === 'generic') {
      warnings.push('Platform not clearly identified - AI will determine best approach');
    }

    if (intent.entry_method === 'search' && intent.target.length < 3) {
      warnings.push('Search query may be too short');
    }

    if (intent.run_count > 10) {
      risks.push('High run count may trigger rate limits');
    }

    if (intent.profile_count === -1) {
      warnings.push('Using all profiles - ensure they are properly configured');
    }

    return {
      is_valid: risks.length === 0,
      warnings,
      risks,
    };
  };

  if (isAnalyzing) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              <Loader2 className="h-4 w-4 text-primary/60 animate-spin absolute -right-1 -bottom-1" />
            </div>
            <p className="text-sm text-muted-foreground">Analyzing your request...</p>
            <p className="text-xs text-muted-foreground/70">Building autonomous execution plan</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-destructive">Unable to create plan</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button size="sm" onClick={analyzePlan}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!plan) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <span>Ready for autonomous execution</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Human Summary */}
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="font-medium">{plan.parsed_intent.human_summary}</p>
        </div>

        {/* Quick Stats */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Target className="h-3 w-3" />
            {plan.parsed_intent.platform}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {plan.parsed_intent.profile_count === -1 ? 'All' : plan.parsed_intent.profile_count} profiles
          </Badge>
          <Badge variant="default" className="gap-1 bg-primary/20 text-primary">
            <Brain className="h-3 w-3" />
            AI Autonomous
          </Badge>
          {plan.parsed_intent.run_count > 1 && (
            <Badge variant="secondary" className="gap-1">
              {plan.parsed_intent.run_count}× each
            </Badge>
          )}
        </div>

        {/* Autonomous Mode Info */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Brain className="h-4 w-4 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium">Autonomous AI Execution</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI agent will analyze page screenshots, decide actions dynamically, 
                adapt to changes, and verify goal completion in real-time.
              </p>
            </div>
          </div>
        </div>

        {/* Warnings & Risks */}
        {(plan.validation.warnings.length > 0 || plan.validation.risks.length > 0) && (
          <div className="space-y-2">
            {plan.validation.risks.map((risk, i) => (
              <div key={`r-${i}`} className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded px-2 py-1">
                <AlertTriangle className="h-3 w-3" />
                {risk}
              </div>
            ))}
            {plan.validation.warnings.map((warning, i) => (
              <div key={`w-${i}`} className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-500/10 rounded px-2 py-1">
                <AlertTriangle className="h-3 w-3" />
                {warning}
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          {onEdit && (
            <Button variant="outline" size="sm" onClick={() => onEdit(plan)} className="flex-1 gap-1">
              <Edit3 className="h-3 w-3" />
              Edit
            </Button>
          )}
          <Button size="sm" onClick={() => onApprove(plan.id, plan)} className="flex-1 gap-1">
            <Play className="h-3 w-3" />
            Start AI Agent
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
