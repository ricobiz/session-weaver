import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, RefreshCw, AlertTriangle } from 'lucide-react';
import { ModelSelector } from './ModelSelector';

interface BalanceData {
  credits: number;
  credits_used: number;
  limit_remaining?: number;
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

  const remaining = balance?.limit_remaining ?? 
    (balance ? balance.credits - (balance.credits_used || 0) : 0);
  const isLow = remaining < 2;

  return (
    <div className="flex items-center gap-2">
      {/* Model Selector */}
      <ModelSelector 
        value={selectedModel} 
        onChange={onModelChange} 
        compact 
      />

      {/* Balance Display */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
        <Wallet className={`w-3.5 h-3.5 ${isLow ? 'text-destructive' : 'text-primary'}`} />
        {isLoading ? (
          <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : balance ? (
          <>
            <span className={`text-sm font-medium ${isLow ? 'text-destructive' : ''}`}>
              ${remaining.toFixed(2)}
            </span>
            {isLow && <AlertTriangle className="w-3 h-3 text-destructive" />}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">--</span>
        )}
      </div>
    </div>
  );
}
