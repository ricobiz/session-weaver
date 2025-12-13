import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, AlertCircle, RefreshCw, Lightbulb, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIFailureExplanationProps {
  sessionId: string;
  errorMessage?: string | null;
  isResumable?: boolean;
  lastSuccessfulStep?: number | null;
}

interface FailureExplanation {
  summary: string;
  root_cause: {
    type: string;
    description: string;
    step_index: number;
    confidence: number;
  };
  contributing_factors: string[];
  recommendations: Array<{
    priority: string;
    action: string;
    code_hint?: string;
  }>;
  is_resumable: boolean;
  resume_from_step: number | null;
  ai_powered: boolean;
}

export function AIFailureExplanation({
  sessionId,
  errorMessage,
  isResumable,
  lastSuccessfulStep,
}: AIFailureExplanationProps) {
  const [explanation, setExplanation] = useState<FailureExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchExplanation = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/logs/explain`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        }
      );
      const result = await response.json();
      setExplanation(result);
    } catch (error) {
      console.error('Explanation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      case 'low': return 'text-blue-500 bg-blue-500/10 border-blue-500/30';
      default: return 'text-muted-foreground bg-muted/50';
    }
  };

  if (!errorMessage) {
    return null;
  }

  return (
    <Card className="bg-card/50 border-border border-red-500/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          Failure Analysis
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">
            {explanation?.ai_powered ? 'AI Powered' : 'Preview'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Error Summary */}
        <div className="p-2 bg-red-500/10 rounded text-xs text-red-300 font-mono">
          {errorMessage}
        </div>

        {!explanation ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={fetchExplanation}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 mr-1" />
                Explain Failure
              </>
            )}
          </Button>
        ) : (
          <>
            {/* Root Cause */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium">Root Cause</span>
                <Badge variant="outline" className="text-[9px] ml-auto">
                  {(explanation.root_cause.confidence * 100).toFixed(0)}% confident
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {explanation.root_cause.description}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">
                Failed at step {explanation.root_cause.step_index + 1} ({explanation.root_cause.type})
              </p>
            </div>

            {/* Contributing Factors */}
            {explanation.contributing_factors.length > 0 && (
              <div className="pt-2 border-t border-border">
                <span className="text-xs font-medium mb-1 block">Contributing Factors</span>
                <ul className="space-y-1">
                  {explanation.contributing_factors.map((factor, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                      <span className="text-muted-foreground/50">•</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {explanation.recommendations.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-1 mb-2">
                  <Lightbulb className="w-3 h-3 text-primary" />
                  <span className="text-xs font-medium">Recommendations</span>
                </div>
                <div className="space-y-2">
                  {explanation.recommendations.map((rec, i) => (
                    <div key={i} className="text-[11px] space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={cn('text-[9px] border', getPriorityColor(rec.priority))}>
                          {rec.priority}
                        </Badge>
                        <span className="text-muted-foreground">{rec.action}</span>
                      </div>
                      {rec.code_hint && (
                        <code className="block text-[10px] bg-muted/30 p-1 rounded font-mono text-muted-foreground">
                          {rec.code_hint}
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resume Info */}
            {explanation.is_resumable && explanation.resume_from_step !== null && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded">
                  <RefreshCw className="w-3 h-3 text-green-500" />
                  <span className="text-xs text-green-400">
                    Session can resume from step {explanation.resume_from_step + 1}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
