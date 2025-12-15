import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Cpu, ChevronDown, Check, Search, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt: string;
    completion: string;
  };
  context_length?: number;
}

// Recommended models for quick access
const RECOMMENDED_MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'anthropic/claude-sonnet-4',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'meta-llama/llama-3.3-70b-instruct',
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  compact?: boolean;
}

export function ModelSelector({ value, onChange, compact = true }: ModelSelectorProps) {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Fetch models from OpenRouter
  useEffect(() => {
    const fetchModels = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/models`
        );
        if (response.ok) {
          const data = await response.json();
          setModels(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen && models.length === 0) {
      fetchModels();
    }
  }, [isOpen, models.length]);

  // Filter models based on search
  const filteredModels = models.filter(model => 
    model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate recommended and other models
  const recommendedModels = filteredModels.filter(m => RECOMMENDED_MODELS.includes(m.id));
  const otherModels = filteredModels.filter(m => !RECOMMENDED_MODELS.includes(m.id));

  // Get display name for selected model
  const selectedModel = models.find(m => m.id === value);
  const displayName = selectedModel?.name || value.split('/').pop() || 'Select Model';

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num === 0) return 'Free';
    if (num < 0.001) return `$${(num * 1000000).toFixed(2)}/M`;
    return `$${num.toFixed(4)}`;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={compact ? "h-8 gap-1.5 text-xs px-2 rounded-lg bg-muted/30 hover:bg-muted/50" : "gap-2"}
        >
          <Cpu className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="max-w-[80px] truncate hidden sm:inline">{displayName}</span>
          <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 glass-panel border-border/50">
        {/* Search input */}
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            {/* Recommended models */}
            {recommendedModels.length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Recommended
                </DropdownMenuLabel>
                {recommendedModels.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => {
                      onChange(model.id);
                      setIsOpen(false);
                    }}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{model.name || model.id}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="truncate">{model.id}</span>
                        {model.pricing && (
                          <span className="text-primary/70">
                            {formatPrice(model.pricing.prompt)}
                          </span>
                        )}
                      </div>
                    </div>
                    {value === model.id && <Check className="w-4 h-4 text-primary ml-2" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}

            {/* Other models */}
            {otherModels.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  All Models ({otherModels.length})
                </DropdownMenuLabel>
                {otherModels.slice(0, 50).map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => {
                      onChange(model.id);
                      setIsOpen(false);
                    }}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{model.name || model.id}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="truncate">{model.id}</span>
                        {model.pricing && (
                          <span className="text-primary/70">
                            {formatPrice(model.pricing.prompt)}
                          </span>
                        )}
                      </div>
                    </div>
                    {value === model.id && <Check className="w-4 h-4 text-primary ml-2" />}
                  </DropdownMenuItem>
                ))}
                {otherModels.length > 50 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground text-center">
                    +{otherModels.length - 50} more (use search)
                  </div>
                )}
              </>
            )}

            {filteredModels.length === 0 && !isLoading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No models found
              </div>
            )}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
