import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Rocket, 
  Database, 
  Bot, 
  Cpu, 
  Server, 
  Users, 
  FileCode,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleStatus {
  name: string;
  status: 'pending' | 'checking' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
  action?: string;
}

interface SetupResult {
  success: boolean;
  ready: boolean;
  modules: ModuleStatus[];
  summary: string;
  timestamp: string;
}

const MODULE_ICONS: Record<string, typeof Database> = {
  database: Database,
  openrouter: Bot,
  ai_models: Cpu,
  runners: Server,
  profiles: Users,
  scenarios: FileCode,
};

const MODULE_LABELS: Record<string, string> = {
  database: 'Database',
  openrouter: 'OpenRouter AI',
  ai_models: 'AI Models',
  runners: 'Runners',
  profiles: 'Profiles',
  scenarios: 'Scenarios',
};

export function SystemSetup() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [modules, setModules] = useState<ModuleStatus[]>([]);
  const [progress, setProgress] = useState(0);

  const runSetup = async () => {
    setIsRunning(true);
    setResult(null);
    setModules([]);
    setProgress(0);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/system-setup`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );

      if (!response.ok || !response.body) {
        throw new Error('Setup request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const totalModules = 6;
      let completedModules = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.module) {
              // Update single module
              setModules(prev => {
                const existing = prev.findIndex(m => m.name === data.module.name);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = data.module;
                  return updated;
                }
                return [...prev, data.module];
              });

              if (data.module.status !== 'checking' && data.module.status !== 'pending') {
                completedModules++;
                setProgress((completedModules / totalModules) * 100);
              }
            } else if (data.success !== undefined) {
              // Final result
              setResult(data);
              setProgress(100);
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    } catch (error) {
      console.error('Setup error:', error);
      setResult({
        success: false,
        ready: false,
        modules: [],
        summary: error instanceof Error ? error.message : 'Setup failed',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: ModuleStatus['status']) => {
    switch (status) {
      case 'success': return <Check className="w-4 h-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error': return <X className="w-4 h-4 text-red-500" />;
      case 'checking': return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      default: return <div className="w-4 h-4 rounded-full border-2 border-muted" />;
    }
  };

  const getStatusColor = (status: ModuleStatus['status']) => {
    switch (status) {
      case 'success': return 'bg-green-500/10 border-green-500/30';
      case 'warning': return 'bg-yellow-500/10 border-yellow-500/30';
      case 'error': return 'bg-red-500/10 border-red-500/30';
      case 'checking': return 'bg-primary/10 border-primary/30 animate-pulse';
      default: return 'bg-muted/30 border-muted';
    }
  };

  const hasRun = result !== null || modules.length > 0;

  return (
    <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Rocket className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">System Setup</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            One-click configuration. The system will verify all modules, optimize AI models, and prepare for automation.
          </p>
        </div>

        {/* Main Button */}
        {!hasRun && (
          <Button
            onClick={runSetup}
            disabled={isRunning}
            size="lg"
            className="w-full h-14 text-lg gap-3 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Setup System
              </>
            )}
          </Button>
        )}

        {/* Progress */}
        {isRunning && (
          <div className="mt-4 space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-center text-muted-foreground">
              Configuring system... {Math.round(progress)}%
            </p>
          </div>
        )}

        {/* Modules Grid */}
        {modules.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
            {modules.map((module) => {
              const Icon = MODULE_ICONS[module.name] || Cpu;
              return (
                <div
                  key={module.name}
                  className={cn(
                    'p-3 rounded-lg border transition-all',
                    getStatusColor(module.status)
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    {getStatusIcon(module.status)}
                  </div>
                  <div className="text-xs font-medium">
                    {MODULE_LABELS[module.name] || module.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {module.message}
                  </div>
                  {module.details && (
                    <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                      {module.details}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Result Summary */}
        {result && (
          <div className="mt-6 space-y-4">
            <div
              className={cn(
                'p-4 rounded-lg border text-center',
                result.ready
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-yellow-500/10 border-yellow-500/30'
              )}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                {result.ready ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                )}
                <span className="font-medium">
                  {result.ready ? 'Ready to Use!' : 'Setup Complete'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={runSetup}
                disabled={isRunning}
                className="flex-1 gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Re-check
              </Button>
              {result.ready && (
                <Button className="flex-1 gap-2">
                  <Rocket className="w-4 h-4" />
                  Start Automating
                </Button>
              )}
            </div>

            {/* Status Badge */}
            <div className="flex justify-center">
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  result.ready ? 'border-green-500/50 text-green-500' : 'border-yellow-500/50 text-yellow-500'
                )}
              >
                {result.ready ? '● System Online' : '○ Configuration Needed'}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
