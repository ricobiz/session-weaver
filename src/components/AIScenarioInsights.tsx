import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, AlertTriangle, Lightbulb, TrendingUp, Loader2, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface AIScenarioInsightsProps {
  scenarioId: string;
  scenarioName: string;
}

interface ScenarioAnalysis {
  quality_score: number;
  estimated_success_rate: number;
  risk_level: string;
  risk_factors: Array<{ factor: string; severity: string; step_indices: number[] }>;
  duration_analysis: { estimated_seconds: number; confidence: number; breakdown: string };
  suggestions: Array<{ type: string; message: string }>;
  ai_powered: boolean;
}

interface ScenarioSuggestion {
  type: string;
  position: number;
  step?: unknown;
  original?: unknown;
  suggested?: unknown;
  reason: string;
}

export function AIScenarioInsights({ scenarioId, scenarioName }: AIScenarioInsightsProps) {
  const [analysis, setAnalysis] = useState<ScenarioAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<ScenarioSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const analyzeScenario = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('session-api', {
        method: 'POST',
        body: {
          scenario_id: scenarioId,
          _path: '/ai/scenario/analyze',
          _method: 'POST',
        },
      });

      // Fallback for direct invocation pattern
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/scenario/analyze`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario_id: scenarioId }),
        }
      );
      const result = await response.json();
      setAnalysis(result);
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSuggestions = async () => {
    setIsSuggesting(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/scenario/suggest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario_id: scenarioId }),
        }
      );
      const result = await response.json();
      setSuggestions(result.suggestions || []);
    } catch (error) {
      console.error('Suggestions error:', error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-500 bg-green-500/10';
      case 'medium': return 'text-amber-500 bg-amber-500/10';
      case 'high': return 'text-red-500 bg-red-500/10';
      default: return 'text-muted-foreground bg-muted/50';
    }
  };

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          AI Insights
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">
            {analysis?.ai_powered ? 'AI Powered' : 'Preview'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!analysis ? (
          <div className="flex flex-col items-center py-4">
            <Sparkles className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs text-muted-foreground text-center mb-3">
              Analyze scenario for quality, risk, and optimization suggestions
            </p>
            <Button size="sm" onClick={analyzeScenario} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3 mr-1" />
                  Analyze Scenario
                </>
              )}
            </Button>
          </div>
        ) : (
          <>
            {/* Quality Score */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Quality Score</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${analysis.quality_score * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono">{(analysis.quality_score * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Success Rate */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Est. Success Rate</span>
              <span className="text-xs font-mono">{(analysis.estimated_success_rate * 100).toFixed(0)}%</span>
            </div>

            {/* Risk Level */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Risk Level</span>
              <Badge className={cn('text-[10px]', getRiskColor(analysis.risk_level))}>
                {analysis.risk_level}
              </Badge>
            </div>

            {/* Duration */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Duration</span>
              <span className="text-xs font-mono">~{analysis.duration_analysis.estimated_seconds}s</span>
            </div>

            {/* Risk Factors */}
            {analysis.risk_factors.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-1 mb-2">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-xs font-medium">Risk Factors</span>
                </div>
                <div className="space-y-1">
                  {analysis.risk_factors.map((rf, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                      <span className={cn('px-1 rounded text-[9px]', getRiskColor(rf.severity))}>
                        {rf.severity}
                      </span>
                      <span>{rf.factor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions */}
            {analysis.suggestions.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-1 mb-2">
                  <Lightbulb className="w-3 h-3 text-primary" />
                  <span className="text-xs font-medium">Suggestions</span>
                </div>
                <div className="space-y-1">
                  {analysis.suggestions.map((s, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground">
                      • {s.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Get Step Suggestions */}
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-2"
              onClick={getSuggestions}
              disabled={isSuggesting}
            >
              {isSuggesting ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Get Step Improvements
                </>
              )}
            </Button>

            {/* Step Suggestions */}
            {suggestions.length > 0 && (
              <ScrollArea className="h-[120px] border border-border rounded p-2 mt-2">
                <div className="space-y-2">
                  {suggestions.map((s, i) => (
                    <div key={i} className="text-[11px] p-2 bg-muted/30 rounded">
                      <Badge variant="outline" className="text-[9px] mb-1">
                        {s.type} @ step {s.position + 1}
                      </Badge>
                      <p className="text-muted-foreground">{s.reason}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
