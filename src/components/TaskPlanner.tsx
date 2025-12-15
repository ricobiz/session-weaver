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
      // Use AI to parse intent from natural language command
      const intent = await parseUserIntentWithAI(userCommand);
      
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

  // AI-powered intent parsing using operator-chat
  const parseUserIntentWithAI = async (input: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: `Parse this user command and extract the intent. Return ONLY valid JSON:
                
User command: "${input}"

Extract and return JSON with these fields:
{
  "platform": "spotify|youtube|instagram|tiktok|twitter|google|vk|web|generic",
  "goal": "play|view|like|comment|follow|scroll|screenshot|navigate|search",
  "entry_method": "url|search",
  "target": "URL or search query - IMPORTANT: if user mentions a site like 'Google', 'YouTube', etc - convert to full URL like 'https://www.google.com'",
  "profile_count": 1,
  "run_count": 1,
  "behavior": {
    "min_duration": 30,
    "max_duration": 120,
    "randomize": true
  },
  "human_summary": "Brief description of what will be done"
}

Rules:
- If user says "go to Google" or "open Google" -> target should be "https://www.google.com"
- If user mentions ANY website name, convert to proper URL (https://...)
- Understand Russian commands like "перейди на", "открой", "сделай скриншот"
- Default goal is "navigate" if just visiting a site
- If "screenshot" mentioned, goal should be "screenshot"`
              }
            ]
          }),
        }
      );

      if (!response.ok) {
        console.warn('AI parsing failed, falling back to regex parser');
        return parseUserIntentFallback(input);
      }

      const data = await response.json();
      
      // Handle different response formats
      let parsed;
      if (data.type === 'task_plan' && data.task) {
        // Convert task_plan format to our intent format
        parsed = {
          platform: data.task.platform || 'generic',
          goal: data.task.goal || 'navigate',
          entry_method: data.task.entry_method === 'direct' ? 'url' : data.task.entry_method || 'url',
          target: data.task.target_url || data.task.search_query || '',
          profile_count: data.task.profile_count || 1,
          run_count: data.task.run_count || 1,
          behavior: {
            min_duration: data.task.behavior?.watch_duration_percent || 30,
            max_duration: 120,
            randomize: true,
          },
          human_summary: data.reasoning || `${data.task.goal} on ${data.task.platform}`,
        };
      } else if (data.type === 'conversation' && data.message) {
        // AI responded with conversation - try to extract JSON from message
        const jsonMatch = data.message.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          console.warn('AI did not return structured data, falling back');
          return parseUserIntentFallback(input);
        }
      } else if (data.platform || data.goal || data.target) {
        // Direct intent format
        parsed = data;
      } else {
        console.warn('Unknown AI response format, falling back');
        return parseUserIntentFallback(input);
      }

      // Validate and fix target URL
      if (parsed.entry_method === 'url' && parsed.target && !parsed.target.startsWith('http')) {
        parsed.target = `https://${parsed.target}`;
      }

      // Ensure all required fields
      return {
        platform: parsed.platform || 'generic',
        goal: parsed.goal || 'navigate',
        entry_method: parsed.entry_method || 'url',
        target: parsed.target || '',
        profile_count: parsed.profile_count || 1,
        run_count: parsed.run_count || 1,
        behavior: {
          min_duration: parsed.behavior?.min_duration || 30,
          max_duration: parsed.behavior?.max_duration || 120,
          randomize: parsed.behavior?.randomize ?? true,
        },
        human_summary: parsed.human_summary || `${parsed.goal} ${parsed.target}`,
      };
    } catch (err) {
      console.error('AI parsing error:', err);
      return parseUserIntentFallback(input);
    }
  };

  // Fallback regex-based parser (used when AI is unavailable)
  const parseUserIntentFallback = (input: string) => {
    return parseUserIntent(input);
  };

  const parseUserIntent = (input: string) => {
    const lower = input.toLowerCase();
    
    // Common site name to URL mappings
    const siteUrls: Record<string, string> = {
      'google': 'https://www.google.com',
      'youtube': 'https://www.youtube.com',
      'spotify': 'https://www.spotify.com',
      'soundcloud': 'https://www.soundcloud.com',
      'tiktok': 'https://www.tiktok.com',
      'instagram': 'https://www.instagram.com',
      'twitter': 'https://twitter.com',
      'x.com': 'https://x.com',
      'facebook': 'https://www.facebook.com',
      'vk': 'https://vk.com',
      'yandex': 'https://ya.ru',
      'яндекс': 'https://ya.ru',
      'гугл': 'https://www.google.com',
      'ютуб': 'https://www.youtube.com',
      'вконтакте': 'https://vk.com',
    };
    
    // Detect platform
    let platform = 'generic';
    if (lower.includes('spotify')) platform = 'spotify';
    else if (lower.includes('youtube') || lower.includes('ютуб')) platform = 'youtube';
    else if (lower.includes('soundcloud')) platform = 'soundcloud';
    else if (lower.includes('tiktok')) platform = 'tiktok';
    else if (lower.includes('instagram')) platform = 'instagram';
    else if (lower.includes('twitter') || lower.includes('x.com')) platform = 'twitter';
    else if (lower.includes('google') || lower.includes('гугл')) platform = 'google';
    else if (lower.includes('vk') || lower.includes('вконтакте')) platform = 'vk';

    // Detect goal
    let goal = 'play';
    if (lower.includes('скриншот') || lower.includes('screenshot')) goal = 'screenshot';
    else if (lower.includes('like') || lower.includes('лайк')) goal = 'like';
    else if (lower.includes('comment') || lower.includes('комментар')) goal = 'comment';
    else if (lower.includes('follow') || lower.includes('subscribe') || lower.includes('подпис')) goal = 'follow';
    else if (lower.includes('play') || lower.includes('listen') || lower.includes('watch') || lower.includes('view') || lower.includes('смотр') || lower.includes('слуша')) goal = 'play';
    else if (lower.includes('share') || lower.includes('поделиться')) goal = 'share';
    else if (lower.includes('перейд') || lower.includes('открой') || lower.includes('зайди') || lower.includes('go to') || lower.includes('open') || lower.includes('visit')) goal = 'navigate';

    // Detect entry method and target
    let entry_method: 'url' | 'search' = 'search';
    let target = '';
    
    // First check for explicit URLs
    const urlMatch = input.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      entry_method = 'url';
      target = urlMatch[0];
    } else {
      // Check for site name mentions and convert to URL
      const sitePattern = /(?:на сайт|на|сайт|перейди на|открой|зайди на|go to|open|visit)\s+([а-яёa-z0-9.-]+)/i;
      const siteMatch = input.match(sitePattern);
      
      if (siteMatch) {
        const siteName = siteMatch[1].toLowerCase().replace(/[.,!?]/g, '');
        // Check if it's a known site
        if (siteUrls[siteName]) {
          entry_method = 'url';
          target = siteUrls[siteName];
        } else if (siteName.includes('.')) {
          // Looks like a domain
          entry_method = 'url';
          target = siteName.startsWith('http') ? siteName : `https://${siteName}`;
        } else {
          // Try to match partial names
          for (const [key, url] of Object.entries(siteUrls)) {
            if (siteName.includes(key) || key.includes(siteName)) {
              entry_method = 'url';
              target = url;
              break;
            }
          }
        }
      }
      
      // If still no URL, check for search intent
      if (!target) {
        const searchMatch = input.match(/(?:search\s+for|find|look\s+for|найди|поиск)\s+["']?([^"']+)["']?/i);
        const quotedMatch = input.match(/["']([^"']+)["']/);
        target = searchMatch?.[1] || quotedMatch?.[1] || '';
        
        // If no target found, use platform as fallback
        if (!target && platform !== 'generic') {
          entry_method = 'url';
          target = siteUrls[platform] || `https://www.${platform}.com`;
        }
      }
    }

    // Detect profile count
    let profile_count = 1;
    const countMatch = input.match(/(\d+)\s*(?:profile|agent|bot|user|профил|агент|бот)/i);
    if (countMatch) {
      profile_count = parseInt(countMatch[1], 10);
    } else if (lower.includes('all profiles') || lower.includes('all agents') || lower.includes('все профил') || lower.includes('все агент')) {
      profile_count = -1;
    }

    // Detect run count
    let run_count = 1;
    const runMatch = input.match(/(\d+)\s*(?:time|run|iteration|repeat|раз)/i);
    const timesMatch = input.match(/(\d+)x\b/i);
    if (runMatch) {
      run_count = parseInt(runMatch[1], 10);
    } else if (timesMatch) {
      run_count = parseInt(timesMatch[1], 10);
    }

    // Duration hints
    let min_duration = 30;
    let max_duration = 120;
    const durationMatch = input.match(/(\d+)\s*(?:second|sec|minute|min|секунд|минут)/i);
    if (durationMatch) {
      const val = parseInt(durationMatch[1], 10);
      if (lower.includes('min') || lower.includes('минут')) {
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
    const actionText = goal === 'screenshot' ? 'Screenshot' : goal === 'navigate' ? 'Navigate to' : goal.charAt(0).toUpperCase() + goal.slice(1);
    const targetText = entry_method === 'url' ? target : `search "${target}"`;
    const human_summary = `${actionText} ${platform !== 'generic' ? platform : ''} ${targetText} using ${profileText}${runText}`.trim().replace(/\s+/g, ' ');

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
