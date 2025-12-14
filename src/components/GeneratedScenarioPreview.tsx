import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileCode, 
  RefreshCw, 
  Eye,
  EyeOff,
  Clock,
  Play,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface Step {
  action: string;
  target?: string;
  duration?: number;
  text?: string;
  selector?: string;
  randomized?: boolean;
}

interface GeneratedScenarioPreviewProps {
  scenario?: {
    id: string;
    name: string;
    steps: Step[];
    estimated_duration_seconds?: number;
  } | null;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

const ACTION_COLORS = {
  open: 'bg-blue-500/20 text-blue-400',
  play: 'bg-green-500/20 text-green-400',
  scroll: 'bg-purple-500/20 text-purple-400',
  click: 'bg-orange-500/20 text-orange-400',
  like: 'bg-pink-500/20 text-pink-400',
  comment: 'bg-cyan-500/20 text-cyan-400',
  wait: 'bg-muted text-muted-foreground',
};

export function GeneratedScenarioPreview({ 
  scenario, 
  onRegenerate,
  isRegenerating 
}: GeneratedScenarioPreviewProps) {
  const [expanded, setExpanded] = useState(true);

  if (!scenario) {
    return (
      <Card className="border-border bg-card/50 border-dashed">
        <CardContent className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <FileCode className="w-6 h-6 mb-2 opacity-50" />
          <p className="text-xs">Scenario will be generated from task</p>
          <p className="text-[10px]">Define a task to see the preview</p>
        </CardContent>
      </Card>
    );
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileCode className="w-4 h-4 text-primary" />
            Generated Scenario
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              AI Generated
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs flex items-center gap-2">
          <span>{scenario.name}</span>
          <span className="text-muted-foreground/50">•</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(scenario.estimated_duration_seconds || 0)}
          </span>
          <span className="text-muted-foreground/50">•</span>
          <span>{scenario.steps.length} steps</span>
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          <ScrollArea className="h-48 pr-3">
            <div className="space-y-1.5">
              {scenario.steps.map((step, index) => {
                const colorClass = ACTION_COLORS[step.action as keyof typeof ACTION_COLORS] || 'bg-muted';
                return (
                  <div 
                    key={index} 
                    className="flex items-center gap-2 p-2 rounded bg-muted/30 group"
                  >
                    <span className="text-[10px] text-muted-foreground font-mono w-4">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Badge className={`${colorClass} text-[10px] px-1.5`}>
                      {step.action}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      {step.target && (
                        <span className="text-[10px] text-muted-foreground truncate block">
                          {step.target}
                        </span>
                      )}
                      {step.text && (
                        <span className="text-[10px] text-muted-foreground truncate block">
                          "{step.text}"
                        </span>
                      )}
                      {step.selector && (
                        <span className="text-[10px] text-muted-foreground font-mono truncate block">
                          {step.selector}
                        </span>
                      )}
                    </div>
                    {step.duration && (
                      <span className="text-[10px] text-muted-foreground">
                        {step.duration}s
                      </span>
                    )}
                    {step.randomized && (
                      <Badge variant="outline" className="text-[8px] px-1">
                        ~
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {onRegenerate && (
            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                size="sm"
                variant="outline"
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="h-7 text-xs gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                Regenerate with Variation
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
