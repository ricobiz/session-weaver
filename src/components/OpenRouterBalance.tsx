import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, RefreshCw, AlertTriangle, TrendingDown } from 'lucide-react';

interface BalanceData {
  credits: number;
  credits_used: number;
  limit?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_cost: number;
  };
}

interface OpenRouterBalanceProps {
  refreshInterval?: number; // ms
  onLowBalance?: (balance: number) => void;
  lowBalanceThreshold?: number;
}

export function OpenRouterBalance({
  refreshInterval = 30000,
  onLowBalance,
  lowBalanceThreshold = 1.0,
}: OpenRouterBalanceProps) {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/ai/balance`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch balance');
      }

      const data = await response.json();
      setBalance(data);
      setLastUpdated(new Date());
      setError(null);

      // Check for low balance
      if (data.credits !== undefined && data.credits < lowBalanceThreshold && onLowBalance) {
        onLowBalance(data.credits);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [lowBalanceThreshold, onLowBalance]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchBalance, refreshInterval]);

  const formatCredits = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) return '0.0000';
    return value.toFixed(4);
  };

  const getBalanceStatus = () => {
    if (!balance) return { color: 'secondary', label: 'Unknown' };
    
    const remaining = balance.credits - (balance.credits_used || 0);
    
    if (remaining < 0.5) return { color: 'destructive', label: 'Critical' };
    if (remaining < 2) return { color: 'warning', label: 'Low' };
    if (remaining < 10) return { color: 'secondary', label: 'Moderate' };
    return { color: 'success', label: 'Healthy' };
  };

  const status = getBalanceStatus();
  const remaining = balance ? balance.credits - (balance.credits_used || 0) : 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            OpenRouter Balance
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={fetchBalance}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div className="flex items-center gap-2 text-destructive text-xs">
            <AlertTriangle className="h-3 w-3" />
            <span>{error}</span>
          </div>
        ) : balance ? (
          <>
            {/* Main Balance Display */}
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-foreground">
                ${formatCredits(remaining)}
              </span>
              <Badge 
                variant={status.color === 'success' ? 'default' : 
                         status.color === 'warning' ? 'secondary' : 
                         status.color === 'destructive' ? 'destructive' : 'outline'}
              >
                {status.label}
              </Badge>
            </div>

            {/* Usage Breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground">Total Credits</div>
                <div className="font-medium">${formatCredits(balance.credits)}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-muted-foreground">Used</div>
                <div className="font-medium">${formatCredits(balance.credits_used || 0)}</div>
              </div>
            </div>

            {/* Spend Rate Warning */}
            {balance.usage && balance.usage.total_cost > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded p-2">
                <TrendingDown className="h-3 w-3" />
                <span>
                  Est. {balance.usage.prompt_tokens + balance.usage.completion_tokens} tokens used
                </span>
              </div>
            )}

            {/* Low Balance Warning */}
            {remaining < lowBalanceThreshold && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                <AlertTriangle className="h-3 w-3" />
                <span>Low balance - tasks may fail</span>
              </div>
            )}

            {/* Last Updated */}
            {lastUpdated && (
              <div className="text-xs text-muted-foreground text-right">
                Updated {lastUpdated.toLocaleTimeString()}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Loading...</div>
        )}
      </CardContent>
    </Card>
  );
}
