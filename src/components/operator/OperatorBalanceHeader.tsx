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
    <div className="flex items-center gap-1.5">
      {/* Model Selector */}
      <ModelSelector 
        value={selectedModel} 
        onChange={onModelChange} 
        compact 
      />

      {/* Balance Display */}
      <a 
        href="https://openrouter.ai/credits"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1.5 px-2 py-1.5 h-8 rounded-lg transition-colors ${
          isLow 
            ? 'bg-destructive/10 text-destructive border border-destructive/20' 
            : 'bg-muted/30 hover:bg-muted/50 text-foreground'
        }`}
        title="Top up credits"
      >
        <Wallet className={`w-3.5 h-3.5 ${isLow ? 'text-destructive' : 'text-primary'}`} />
        {isLoading ? (
          <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : balance ? (
          <>
            <span className="text-xs font-medium">${remaining.toFixed(2)}</span>
            {isLow && <AlertTriangle className="w-3 h-3" />}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">--</span>
        )}
      </a>
    </div>
  );
}
