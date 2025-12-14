import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, Zap, Eye, Brain, FileText, Settings2, TrendingDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  checkModelOptimization,
  applyModelOptimization,
  fetchModelConfigs,
  updateModelConfig,
  type ModelConfig,
  type OptimizationResult,
} from '@/lib/api';

const TASK_ICONS: Record<string, typeof Eye> = {
  vision: Eye,
  reasoning: Brain,
  parsing: FileText,
  planning: Settings2,
  embedding: Zap,
};

const TASK_LABELS: Record<string, string> = {
  vision: 'Vision (Screenshots)',
  reasoning: 'Reasoning (Decisions)',
  parsing: 'Parsing (Logs/JSON)',
  planning: 'Planning (Scenarios)',
  embedding: 'Embeddings',
};

export function AIModelOptimizer() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const data = await fetchModelConfigs();
    setConfigs(data);
  };

  const handleCheckOptimization = async () => {
    setIsLoading(true);
    try {
      const result = await checkModelOptimization();
      setOptimization(result);
      if (result?.success) {
        toast({
          title: 'Analysis Complete',
          description: `Cached ${result.models_cached} models from OpenRouter`,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check optimization',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyOptimization = async () => {
    setIsOptimizing(true);
    try {
      const result = await applyModelOptimization();
      setOptimization(result);
      if (result?.success) {
        const updated = result.recommendations.filter(r => r.updated).length;
        toast({
          title: 'Optimization Applied',
          description: `Updated ${updated} model configurations`,
        });
        await loadConfigs();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to apply optimization',
        variant: 'destructive',
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleToggleAutoUpdate = async (taskType: string, enabled: boolean) => {
    const success = await updateModelConfig(taskType, { auto_update: enabled });
    if (success) {
      setConfigs(prev =>
        prev.map(c => (c.task_type === taskType ? { ...c, auto_update: enabled } : c))
      );
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return 'N/A';
    return `$${price.toFixed(4)}/M`;
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                AI Model Auto-Optimizer
              </CardTitle>
              <CardDescription>
                Automatically monitors OpenRouter pricing and selects optimal models for each task
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckOptimization}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Check Prices
              </Button>
              <Button
                size="sm"
                onClick={handleApplyOptimization}
                disabled={isOptimizing || !optimization}
              >
                {isOptimizing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <TrendingDown className="h-4 w-4 mr-2" />
                )}
                Apply Optimal
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Current Configurations */}
      <div className="grid gap-4 md:grid-cols-2">
        {configs.map(config => {
          const Icon = TASK_ICONS[config.task_type] || Settings2;
          const recommendation = optimization?.recommendations.find(
            r => r.task_type === config.task_type
          );

          return (
            <Card key={config.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">
                      {TASK_LABELS[config.task_type] || config.task_type}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Auto</span>
                    <Switch
                      checked={config.auto_update}
                      onCheckedChange={v => handleToggleAutoUpdate(config.task_type, v)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Primary Model</div>
                  <code className="text-xs bg-muted px-2 py-1 rounded block truncate">
                    {config.primary_model}
                  </code>
                </div>

                {config.fallback_model && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Fallback</div>
                    <code className="text-xs bg-muted px-2 py-1 rounded block truncate">
                      {config.fallback_model}
                    </code>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Max: {formatPrice(config.max_price_per_million_input)}
                  </span>
                  <span className="text-muted-foreground">
                    Checked: {formatTime(config.last_checked_at)}
                  </span>
                </div>

                {config.required_capabilities.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {config.required_capabilities.map(cap => (
                      <Badge key={cap} variant="secondary" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                )}

                {recommendation && recommendation.recommended_primary !== config.primary_model && (
                  <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded">
                    <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                      Recommendation Available
                    </div>
                    <div className="text-xs mt-1">
                      Switch to{' '}
                      <code className="bg-muted px-1 rounded">
                        {recommendation.recommended_primary}
                      </code>
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400">
                      Potential savings: {recommendation.price_savings}
                    </div>
                  </div>
                )}

                {recommendation?.updated && (
                  <Badge variant="default" className="bg-green-500">
                    Updated
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Top Vision Models */}
      {optimization?.top_vision_models && optimization.top_vision_models.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Top 10 Cheapest Vision Models (Current Prices)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {optimization.top_vision_models.map((model, i) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between text-xs bg-muted/50 p-2 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{i + 1}.</span>
                    <code className="truncate max-w-[200px]">{model.id}</code>
                  </div>
                  <div className="flex gap-2 text-muted-foreground">
                    <span>In: {model.price_input}</span>
                    <span>Out: {model.price_output}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
