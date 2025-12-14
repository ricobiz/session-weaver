import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { 
  Settings, 
  Key, 
  Cpu, 
  DollarSign, 
  Search,
  Check,
  Loader2,
  RefreshCw,
  Zap,
  ExternalLink,
  Bot
} from 'lucide-react';
import { AIModelOptimizer } from './AIModelOptimizer';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  description?: string;
  architecture?: {
    modality: string;
  };
}

interface AISettingsPanelProps {
  onModelChange?: (modelId: string) => void;
  selectedModel?: string;
}

const RECOMMENDED_MODELS = [
  'google/gemini-flash-1.5',
  'google/gemini-2.0-flash-exp',
  'deepseek/deepseek-chat',
  'qwen/qwen-2.5-72b-instruct',
  'anthropic/claude-3-haiku',
  'meta-llama/llama-3.1-70b-instruct',
  'openai/gpt-4o-mini',
];

export function AISettingsPanel({ onModelChange, selectedModel: externalSelectedModel }: AISettingsPanelProps) {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState(externalSelectedModel || 'google/gemini-flash-1.5');
  const [apiKeyStatus, setApiKeyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
  const [isTestingKey, setIsTestingKey] = useState(false);

  // Load models from OpenRouter
  const loadModels = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch models');
      
      const data = await response.json();
      if (data?.data) {
        setModels(data.data);
        setApiKeyStatus('valid');
      } else if (Array.isArray(data)) {
        setModels(data);
        setApiKeyStatus('valid');
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setApiKeyStatus('invalid');
      toast({
        title: 'Failed to load models',
        description: 'Check your OpenRouter API key configuration.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  // Test API key
  const testApiKey = async () => {
    setIsTestingKey(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      
      const data = await response.json();
      
      if (data?.success) {
        setApiKeyStatus('valid');
        toast({ title: 'API Key Valid', description: 'OpenRouter connection successful.' });
        loadModels();
      } else {
        setApiKeyStatus('invalid');
        toast({ title: 'API Key Invalid', description: data?.error || 'Check your configuration.', variant: 'destructive' });
      }
    } catch (error) {
      setApiKeyStatus('invalid');
      toast({ title: 'Connection Failed', description: 'Unable to verify API key.', variant: 'destructive' });
    } finally {
      setIsTestingKey(false);
    }
  };

  // Filter models
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show recommended models first, then others
      return models.sort((a, b) => {
        const aRec = RECOMMENDED_MODELS.includes(a.id) ? 0 : 1;
        const bRec = RECOMMENDED_MODELS.includes(b.id) ? 0 : 1;
        return aRec - bRec;
      });
    }
    
    const query = searchQuery.toLowerCase();
    return models.filter(m => 
      m.id.toLowerCase().includes(query) || 
      m.name.toLowerCase().includes(query) ||
      m.description?.toLowerCase().includes(query)
    );
  }, [models, searchQuery]);

  // Format pricing per million tokens
  const formatPricing = (price: string) => {
    const priceNum = parseFloat(price);
    const perMillion = priceNum * 1_000_000;
    if (perMillion < 0.01) return '<$0.01';
    if (perMillion < 1) return `$${perMillion.toFixed(2)}`;
    return `$${perMillion.toFixed(2)}`;
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    onModelChange?.(modelId);
    
    // Save to localStorage for persistence
    localStorage.setItem('ai_selected_model', modelId);
    
    toast({ title: 'Model Selected', description: `Now using ${modelId}` });
  };

  return (
    <Tabs defaultValue="models" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="models" className="text-xs gap-1.5">
          <Cpu className="w-3 h-3" />
          Manual Selection
        </TabsTrigger>
        <TabsTrigger value="auto" className="text-xs gap-1.5">
          <Bot className="w-3 h-3" />
          Auto-Optimizer
        </TabsTrigger>
      </TabsList>

      <TabsContent value="models">
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="w-4 h-4 text-primary" />
                AI Configuration
              </CardTitle>
              <Badge 
                className={`text-[10px] ${
                  apiKeyStatus === 'valid' ? 'bg-green-500/20 text-green-400' :
                  apiKeyStatus === 'invalid' ? 'bg-red-500/20 text-red-400' :
                  'bg-muted'
                }`}
              >
                {apiKeyStatus === 'valid' && <Check className="w-2.5 h-2.5 mr-1" />}
                {apiKeyStatus === 'valid' ? 'Connected' : apiKeyStatus === 'invalid' ? 'Not Connected' : 'Unknown'}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Configure OpenRouter AI model for scenario analysis and failure explanation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* API Key Status */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 p-2 rounded bg-muted/30">
                <Key className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">OpenRouter API Key</span>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {apiKeyStatus === 'valid' ? 'Configured' : 'Set in Secrets'}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={testApiKey}
                disabled={isTestingKey}
                className="h-8"
              >
                {isTestingKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              </Button>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" />
                  Select Model
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadModels}
                  disabled={isLoading}
                  className="h-6 text-[10px] gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search models by name or provider..."
                  className="h-8 pl-8 text-xs bg-muted/50"
                />
              </div>

              {/* Model List */}
              <ScrollArea className="h-48 rounded border border-border bg-muted/20">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredModels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Cpu className="w-6 h-6 mb-1 opacity-50" />
                    <p className="text-xs">{models.length === 0 ? 'No models loaded' : 'No models match search'}</p>
                  </div>
                ) : (
                  <div className="p-1.5 space-y-1">
                    {filteredModels.slice(0, 50).map((model) => {
                      const isSelected = selectedModel === model.id;
                      const isRecommended = RECOMMENDED_MODELS.includes(model.id);
                      
                      return (
                        <div
                          key={model.id}
                          onClick={() => handleSelectModel(model.id)}
                          className={`p-2 rounded cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-primary/20 border border-primary/30' 
                              : 'hover:bg-muted/50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium truncate">{model.name}</span>
                                {isRecommended && (
                                  <Badge className="text-[8px] px-1 bg-primary/20 text-primary">
                                    Recommended
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground truncate block">
                                {model.id}
                              </span>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                          </div>
                          
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-2.5 h-2.5" />
                              In: {formatPricing(model.pricing.prompt)}/M
                            </span>
                            <span>Out: {formatPricing(model.pricing.completion)}/M</span>
                            <span>{(model.context_length / 1000).toFixed(0)}K ctx</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              {/* Currently Selected */}
              <div className="p-2 rounded bg-primary/5 border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Active Model:</span>
                  <span className="text-xs font-medium">{selectedModel}</span>
                </div>
              </div>
            </div>

            {/* OpenRouter Link */}
            <a 
              href="https://openrouter.ai/keys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Manage API Keys at OpenRouter
            </a>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="auto">
        <AIModelOptimizer />
      </TabsContent>
    </Tabs>
  );
}
