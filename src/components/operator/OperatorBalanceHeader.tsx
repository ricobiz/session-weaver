import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModelSelector } from './ModelSelector';

interface BalanceData {
  balance: number;
  total_credits?: number;
  credits_used: number;
  is_free_tier?: boolean;
}

interface OperatorBalanceHeaderProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function OperatorBalanceHeader({ selectedModel, onModelChange }: OperatorBalanceHeaderProps) {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/balance`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );
      if (response.ok) {
        const data = await response.json();
        setBalance(data);
      }
    } catch (err) {
      console.error('Balance fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 60000); // Every minute
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const remaining = balance?.balance ?? 0;
  const modelName = selectedModel.split('/').pop() || selectedModel;

  return (
    <div className="flex items-center gap-1">
      {/* Model Selector with model name shown */}
      <ModelSelector 
        value={selectedModel} 
        onChange={onModelChange} 
        compact 
      />
      
      {/* Model name text */}
      <span className="text-[9px] text-muted-foreground truncate max-w-[60px] hidden sm:inline">
        {modelName}
      </span>

      {/* Balance - just number */}
      <a 
        href="https://openrouter.ai/credits"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] text-muted-foreground hover:text-foreground"
        title="OpenRouter balance"
      >
        {isLoading ? (
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        ) : (
          `$${remaining.toFixed(2)}`
        )}
      </a>
    </div>
  );
}
