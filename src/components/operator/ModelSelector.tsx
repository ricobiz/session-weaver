import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Cpu, ChevronDown, Check } from 'lucide-react';

const MODELS = [
  { id: 'google/gemini-2.5-flash', name: 'Gemini Flash', desc: 'Fast & balanced' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini Pro', desc: 'High quality' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', desc: 'Reliable' },
] as const;

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  compact?: boolean;
}

export function ModelSelector({ value, onChange, compact = true }: ModelSelectorProps) {
  const selected = MODELS.find(m => m.id === value) || MODELS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={compact ? "h-7 gap-1.5 text-xs px-2" : "gap-2"}
        >
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">{selected.name}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {MODELS.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onChange(model.id)}
            className="flex items-center justify-between"
          >
            <div>
              <div className="text-sm font-medium">{model.name}</div>
              <div className="text-xs text-muted-foreground">{model.desc}</div>
            </div>
            {value === model.id && <Check className="w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
