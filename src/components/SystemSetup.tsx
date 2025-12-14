import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  RefreshCw,
  Cloud,
  ExternalLink,
  Github,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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

interface RailwayStatus {
  connected: boolean;
  user?: { email: string; name: string };
  projects?: Array<{ id: string; name: string; services: Array<{ id: string; name: string }> }>;
  existingRunner?: { projectId: string; serviceId: string; name: string };
  dashboardUrl?: string;
}

const MODULE_ICONS: Record<string, typeof Database> = {
  database: Database,
  openrouter: Bot,
  ai_models: Cpu,
  runners: Server,
  profiles: Users,
  scenarios: FileCode,
  railway: Cloud,
};

const MODULE_LABELS: Record<string, string> = {
  database: 'Database',
  openrouter: 'OpenRouter AI',
  ai_models: 'AI Models',
  runners: 'Runners',
  profiles: 'Profiles',
  scenarios: 'Scenarios',
  railway: 'Railway Backend',
};

export function SystemSetup() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [modules, setModules] = useState<ModuleStatus[]>([]);
  const [progress, setProgress] = useState(0);
  
  // Railway deployment state
  const [railwayStatus, setRailwayStatus] = useState<RailwayStatus | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ success: boolean; dashboardUrl?: string; error?: string } | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [deletingProjects, setDeletingProjects] = useState<Set<string>>(new Set());
  const [showProjects, setShowProjects] = useState(false);

  const checkRailway = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/railway-deploy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'check' }),
        }
      );

      const data = await response.json();
      setRailwayStatus(data);
      return data;
    } catch (error) {
      console.error('Railway check error:', error);
      return null;
    }
  };

  const deployToRailway = async () => {
    if (!repoUrl.trim()) {
      toast({
        title: 'Repository URL Required',
        description: 'Please enter your GitHub repository URL to deploy.',
        variant: 'destructive',
      });
      return;
    }

    setIsDeploying(true);
    setDeployResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/railway-deploy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'deploy', repoUrl: repoUrl.trim() }),
        }
      );

      const data = await response.json();
      setDeployResult(data);

      if (data.success) {
        toast({
          title: 'Runner Deployed!',
          description: 'Backend is starting on Railway. It will be online in ~2 minutes.',
        });
        // Update railway status
        await checkRailway();
      } else {
        toast({
          title: 'Deployment Failed',
          description: data.error || 'Check Railway dashboard for details.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Deploy error:', error);
      setDeployResult({
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    setDeletingProjects(prev => new Set(prev).add(projectId));
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/railway-deploy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'delete-project', projectId }),
        }
      );

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Project Deleted',
          description: 'Railway project has been removed.',
        });
        // Refresh list
        await checkRailway();
      } else {
        toast({
          title: 'Delete Failed',
          description: data.error || 'Could not delete project.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete project',
        variant: 'destructive',
      });
    } finally {
      setDeletingProjects(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const runSetup = async () => {
    setIsRunning(true);
    setResult(null);
    setModules([]);
    setProgress(0);

    // First check Railway
    await checkRailway();

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
  const runnersModule = modules.find(m => m.name === 'runners');
  const needsBackend = runnersModule?.status === 'warning' && !runnersModule?.details?.includes('online');

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
            One-click configuration. Verify modules, optimize AI, and deploy backend automatically.
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

        {/* Railway Backend Deploy Section */}
        {hasRun && needsBackend && (
          <div className="mt-6 p-4 rounded-lg border-2 border-dashed border-blue-500/30 bg-blue-500/5">
            <div className="flex items-center gap-2 mb-3">
              <Cloud className="w-5 h-5 text-blue-500" />
              <span className="font-medium">Deploy Backend Runner</span>
            </div>
            
            <p className="text-xs text-muted-foreground mb-4">
              No runners detected. Deploy from GitHub or run locally.
            </p>

            {railwayStatus?.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-green-500">
                  <Check className="w-3 h-3" />
                  Railway: {railwayStatus.user?.email}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repoUrl" className="text-xs flex items-center gap-1">
                    <Github className="w-3 h-3" />
                    GitHub Repository URL
                  </Label>
                  <Input
                    id="repoUrl"
                    placeholder="https://github.com/username/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className="text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Enter the URL of your public GitHub repository containing the runner code
                  </p>
                </div>

                {/* Existing Projects Management */}
                {railwayStatus.projects && railwayStatus.projects.length > 0 && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowProjects(!showProjects)}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>{showProjects ? '▼' : '▶'}</span>
                      Railway Projects ({railwayStatus.projects.length})
                    </button>
                    
                    {showProjects && (
                      <div className="space-y-2 pl-4 border-l-2 border-muted">
                        {railwayStatus.projects.map((project) => (
                          <div key={project.id} className="p-2 rounded bg-muted/30 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium truncate flex-1">{project.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => deleteProject(project.id)}
                                disabled={deletingProjects.has(project.id)}
                              >
                                {deletingProjects.has(project.id) ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                            {project.services.length > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                Services: {project.services.map(s => s.name).join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {railwayStatus.existingRunner && (
                  <div className="p-2 rounded bg-muted/50 text-xs">
                    <span className="text-muted-foreground">Active Runner: </span>
                    <span className="font-medium">{railwayStatus.existingRunner.name}</span>
                  </div>
                )}

                <Button
                  onClick={deployToRailway}
                  disabled={isDeploying || deployResult?.success || !repoUrl.trim()}
                  className="w-full gap-2"
                >
                  {isDeploying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deploying from GitHub...
                    </>
                  ) : deployResult?.success ? (
                    <>
                      <Check className="w-4 h-4" />
                      Deployed - Wait ~2 min
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      {railwayStatus.existingRunner ? 'Redeploy from GitHub' : 'Deploy from GitHub'}
                    </>
                  )}
                </Button>

                {deployResult?.dashboardUrl && (
                  <a 
                    href={deployResult.dashboardUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block text-center text-xs text-primary hover:underline"
                  >
                    Open Railway Dashboard →
                  </a>
                )}
              </div>
            ) : railwayStatus === null ? (
              <Button
                variant="outline"
                onClick={checkRailway}
                className="w-full gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Check Railway Connection
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-yellow-500">
                  <AlertTriangle className="w-3 h-3" />
                  Railway API token not configured
                </div>
                <p className="text-xs text-muted-foreground">
                  Add RAILWAY_API_TOKEN in Settings → Secrets to enable auto-deploy.
                </p>
              </div>
            )}

            {deployResult?.success && (
              <div className="mt-3 p-2 rounded bg-green-500/10 border border-green-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-500">Deployment started!</span>
                  {deployResult.dashboardUrl && (
                    <a
                      href={deployResult.dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open Railway
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {deployResult?.error && (
              <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/30">
                <span className="text-xs text-red-500">{deployResult.error}</span>
              </div>
            )}
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
