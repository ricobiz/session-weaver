import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, RefreshCw, AlertTriangle } from 'lucide-react';
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
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const remaining = balance?.balance ?? 0;
  const isLow = remaining < 2;

  return (
    <div className="flex items-center gap-1">
      {/* Model Selector */}
      <ModelSelector 
        value={selectedModel} 
        onChange={onModelChange} 
        compact 
      />

      {/* Balance Display - minimal */}
      <a 
        href="https://openrouter.ai/credits"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1 px-1.5 py-1 h-7 rounded text-[10px] font-medium transition-colors ${
          isLow 
            ? 'bg-destructive/10 text-destructive' 
            : 'bg-muted/30 hover:bg-muted/50 text-muted-foreground'
        }`}
        title="Top up credits"
      >
        {isLoading ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : balance ? (
          <span>${remaining.toFixed(2)}</span>
        ) : (
          <span>--</span>
        )}
      </a>
    </div>
  );
}
