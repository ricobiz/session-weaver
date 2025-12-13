import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Lightbulb, 
  Loader2,
  BarChart2,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIInsightsPanelProps {
  className?: string;
}

interface SessionInsights {
  summary: {
    total_sessions: number;
    success_rate: string | number;
    avg_duration_seconds: number;
    trend: string;
  };
  patterns: Array<{
    type: string;
    description: string;
    affected_sessions?: number;
    recommendation?: string;
    severity: string;
  }>;
  weak_steps: Array<{
    step_action: string;
    failure_rate: number;
    common_error: string;
  }>;
  optimization_tips: string[];
  ai_powered: boolean;
}

export function AIInsightsPanel({ className }: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<SessionInsights | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchInsights = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/sessions/insights`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      const result = await response.json();
      setInsights(result);
    } catch (error) {
      console.error('Insights error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-500 bg-red-500/10';
      case 'medium': return 'text-amber-500 bg-amber-500/10';
      case 'low': return 'text-blue-500 bg-blue-500/10';
      case 'info': return 'text-green-500 bg-green-500/10';
      default: return 'text-muted-foreground bg-muted/50';
    }
  };

  const getPatternIcon = (type: string) => {
    switch (type) {
      case 'failure_cluster': return <AlertTriangle className="w-3 h-3" />;
      case 'step_bottleneck': return <Target className="w-3 h-3" />;
      case 'success_pattern': return <TrendingUp className="w-3 h-3" />;
      default: return <BarChart2 className="w-3 h-3" />;
    }
  };

  return (
    <Card className={cn('bg-card/50 border-border', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          AI Insights
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">
            {insights?.ai_powered ? 'AI Powered' : 'Preview'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!insights ? (
          <div className="flex flex-col items-center py-6">
            <Sparkles className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground text-center mb-4 max-w-[200px]">
              Get AI-powered insights about session patterns, failure analysis, and optimization tips
            </p>
            <Button onClick={fetchInsights} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Insights
                </>
              )}
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-muted/30 rounded">
                  <span className="text-[10px] text-muted-foreground block">Sessions</span>
                  <span className="text-lg font-semibold">{insights.summary.total_sessions}</span>
                </div>
                <div className="p-2 bg-muted/30 rounded">
                  <span className="text-[10px] text-muted-foreground block">Success Rate</span>
                  <span className="text-lg font-semibold">{insights.summary.success_rate}%</span>
                </div>
                <div className="p-2 bg-muted/30 rounded">
                  <span className="text-[10px] text-muted-foreground block">Avg Duration</span>
                  <span className="text-lg font-semibold">{insights.summary.avg_duration_seconds}s</span>
                </div>
                <div className="p-2 bg-muted/30 rounded">
                  <span className="text-[10px] text-muted-foreground block">Trend</span>
                  <div className="flex items-center gap-1">
                    {insights.summary.trend === 'improving' ? (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm capitalize">{insights.summary.trend}</span>
                  </div>
                </div>
              </div>

              {/* Patterns */}
              <div>
                <h4 className="text-xs font-medium mb-2 flex items-center gap-1">
                  <BarChart2 className="w-3 h-3 text-primary" />
                  Detected Patterns
                </h4>
                <div className="space-y-2">
                  {insights.patterns.map((pattern, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-2 rounded border',
                        getSeverityColor(pattern.severity),
                        'border-current/20'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {getPatternIcon(pattern.type)}
                        <Badge variant="outline" className="text-[9px]">
                          {pattern.type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-[11px] mb-1">{pattern.description}</p>
                      {pattern.recommendation && (
                        <p className="text-[10px] text-muted-foreground italic">
                          → {pattern.recommendation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Weak Steps */}
              {insights.weak_steps.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    Steps Needing Attention
                  </h4>
                  <div className="space-y-1">
                    {insights.weak_steps.map((step, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                        <div>
                          <span className="font-mono">{step.step_action}</span>
                          <span className="text-muted-foreground ml-2">({step.common_error})</span>
                        </div>
                        <Badge variant="outline" className="text-red-400 bg-red-500/10">
                          {(step.failure_rate * 100).toFixed(0)}% fail
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optimization Tips */}
              <div>
                <h4 className="text-xs font-medium mb-2 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-primary" />
                  Optimization Tips
                </h4>
                <ul className="space-y-1">
                  {insights.optimization_tips.map((tip, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Refresh */}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={fetchInsights}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3 mr-1" />
                )}
                Refresh Insights
              </Button>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
