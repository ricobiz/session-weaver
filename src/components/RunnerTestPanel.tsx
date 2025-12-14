import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play, 
  Camera, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Globe,
  MousePointer,
  Type,
  ArrowDown,
  Wifi,
  WifiOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface RunnerTestResult {
  success: boolean;
  currentUrl?: string;
  screenshot?: string;
  logs?: string[];
  error?: string;
}

export function RunnerTestPanel() {
  const [runnerUrl, setRunnerUrl] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<RunnerTestResult | null>(null);
  const [testUrl, setTestUrl] = useState('https://google.com');

  // Load runner URL from railway_config
  useEffect(() => {
    const loadRunnerUrl = async () => {
      const { data } = await supabase
        .from('railway_config')
        .select('runner_url')
        .eq('id', 'default')
        .single();
      
      if (data?.runner_url) {
        setRunnerUrl(data.runner_url);
        checkConnection(data.runner_url);
      }
    };
    loadRunnerUrl();
  }, []);

  const checkConnection = async (url?: string) => {
    const targetUrl = url || runnerUrl;
    if (!targetUrl) return;

    try {
      const { data, error } = await supabase.functions.invoke('runner-test', {
        method: 'GET',
      });

      // The edge function uses RUNNER_API_URL secret
      if (error) throw error;
      
      setIsConnected(data?.status === 'ok');
    } catch {
      // Try direct health check via edge function
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/runner-test/health`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        const result = await response.json();
        setIsConnected(result?.status === 'ok');
      } catch {
        setIsConnected(false);
      }
    }
  };

  const executeAction = async (action: string, params: Record<string, any> = {}) => {
    setIsLoading(true);
    setLastResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/runner-test/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...params }),
        }
      );

      const result = await response.json();
      setLastResult(result);

      if (result.success) {
        toast({
          title: 'Action completed',
          description: `${action} executed successfully`,
        });
      } else {
        toast({
          title: 'Action failed',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setLastResult({ success: false, error: errorMsg });
      toast({
        title: 'Request failed',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigate = () => executeAction('navigate', { url: testUrl });
  const handleScreenshot = () => executeAction('screenshot');
  const handleClick = (x: number, y: number) => executeAction('click', { coordinates: { x, y } });
  const handleScroll = () => executeAction('scroll', { coordinates: { y: 300 } });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Runner Test Panel
          </span>
          <Badge 
            variant={isConnected ? 'default' : 'destructive'} 
            className="flex items-center gap-1"
          >
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <Input 
            value={runnerUrl} 
            onChange={(e) => setRunnerUrl(e.target.value)}
            placeholder="Runner URL" 
            className="flex-1 font-mono text-xs"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => checkConnection()}
            disabled={!runnerUrl}
          >
            Test
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          <Input 
            value={testUrl} 
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="URL to navigate" 
            className="flex-1"
          />
          <Button onClick={handleNavigate} disabled={isLoading || !isConnected}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            <span className="ml-2">Go</span>
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleScreenshot}
            disabled={isLoading || !isConnected}
          >
            <Camera className="h-4 w-4 mr-1" />
            Screenshot
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleClick(640, 360)}
            disabled={isLoading || !isConnected}
          >
            <MousePointer className="h-4 w-4 mr-1" />
            Click Center
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleScroll}
            disabled={isLoading || !isConnected}
          >
            <ArrowDown className="h-4 w-4 mr-1" />
            Scroll Down
          </Button>
        </div>

        {/* Result */}
        {lastResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {lastResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm font-medium">
                {lastResult.success ? 'Success' : 'Failed'}
              </span>
              {lastResult.currentUrl && (
                <span className="text-xs text-muted-foreground truncate">
                  {lastResult.currentUrl}
                </span>
              )}
            </div>

            {/* Screenshot Preview */}
            {lastResult.screenshot && (
              <div className="border rounded-lg overflow-hidden">
                <img 
                  src={`data:image/png;base64,${lastResult.screenshot}`}
                  alt="Screenshot"
                  className="w-full h-auto"
                />
              </div>
            )}

            {/* Logs */}
            {lastResult.logs && lastResult.logs.length > 0 && (
              <ScrollArea className="h-24 border rounded-lg">
                <div className="p-2 text-xs font-mono space-y-1">
                  {lastResult.logs.map((log, i) => (
                    <div key={i} className="text-muted-foreground">{log}</div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Error */}
            {lastResult.error && (
              <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded">
                {lastResult.error}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
