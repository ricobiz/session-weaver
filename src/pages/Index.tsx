import { useState } from 'react';
import { Header } from '@/components/Header';
import { StatCard } from '@/components/StatCard';
import { SessionCard } from '@/components/SessionCard';
import { LogViewer } from '@/components/LogViewer';
import { ScenarioViewer } from '@/components/ScenarioViewer';
import { ProfileList } from '@/components/ProfileList';
import { ExecutionPanel } from '@/components/ExecutionPanel';
import { CreateProfileDialog } from '@/components/CreateProfileDialog';
import { CreateScenarioDialog } from '@/components/CreateScenarioDialog';
import { SessionTimeline } from '@/components/SessionTimeline';
import { MetricsDashboard } from '@/components/MetricsDashboard';
import { DataExport } from '@/components/DataExport';
import { useStats, useProfiles, useScenarios, useSessions, useSessionLogs, useRunnerHealth } from '@/hooks/useSessionData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Users, 
  FileCode,
  Layers,
  Terminal,
  Plus,
  Loader2,
  BarChart3,
  AlignLeft
} from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Scenario = Database['public']['Tables']['scenarios']['Row'];

const Index = () => {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles();
  const { data: scenarios = [], isLoading: scenariosLoading } = useScenarios();
  const { data: sessions = [], isLoading: sessionsLoading } = useSessions();
  const { data: runners = [] } = useRunnerHealth();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);
  const [rightPanelView, setRightPanelView] = useState<'logs' | 'timeline' | 'metrics'>('logs');

  const { data: logs = [] } = useSessionLogs(selectedSessionId);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  // Convert DB logs to component format
  const formattedLogs = logs.map(log => ({
    timestamp: new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false }),
    level: log.level as 'info' | 'success' | 'warning' | 'error',
    message: log.message,
    step: log.step_index ?? undefined
  }));

  const isLoading = statsLoading || profilesLoading || scenariosLoading || sessionsLoading;

  if (isLoading && !stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard
            title="Active Sessions"
            value={stats?.activeSessions ?? 0}
            icon={Activity}
            variant="warning"
          />
          <StatCard
            title="Completed Today"
            value={stats?.completedToday ?? 0}
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Failed Today"
            value={stats?.failedToday ?? 0}
            icon={XCircle}
            variant="error"
          />
          <StatCard
            title="Avg Duration"
            value={stats?.avgDuration ?? '0m 0s'}
            icon={Clock}
            variant="default"
          />
          <StatCard
            title="Profiles"
            value={stats?.totalProfiles ?? 0}
            icon={Users}
            variant="primary"
          />
          <StatCard
            title="Scenarios"
            value={stats?.totalScenarios ?? 0}
            icon={FileCode}
            variant="primary"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Panel - Sessions & Execution */}
          <div className="lg:col-span-4 space-y-4">
            <Tabs defaultValue="sessions" className="w-full">
              <TabsList className="w-full bg-muted/50">
                <TabsTrigger value="sessions" className="flex-1 gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Sessions
                </TabsTrigger>
                <TabsTrigger value="profiles" className="flex-1 gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Profiles
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="sessions" className="mt-3">
                <ScrollArea className="h-[320px] pr-3">
                  {sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                      <Layers className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">No sessions yet</p>
                      <p className="text-xs">Start an execution below</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={{
                            id: session.id,
                            profileId: session.profile_id || '',
                            profileName: session.profiles?.name || 'Unknown',
                            scenarioId: session.scenario_id || '',
                            scenarioName: session.scenarios?.name || 'Unknown',
                            status: session.status as any,
                            progress: session.progress || 0,
                            currentStep: session.current_step || 0,
                            totalSteps: session.total_steps || 0,
                            startTime: session.started_at || session.created_at,
                            logs: []
                          }}
                          isSelected={selectedSessionId === session.id}
                          onClick={() => setSelectedSessionId(session.id)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="profiles" className="mt-3">
                <div className="flex justify-end mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setProfileDialogOpen(true)}
                    className="gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Profile
                  </Button>
                </div>
                <ScrollArea className="h-[280px] pr-3">
                  {profiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                      <Users className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">No profiles yet</p>
                      <p className="text-xs">Add a profile to start</p>
                    </div>
                  ) : (
                    <ProfileList 
                      profiles={profiles.map(p => ({
                        id: p.id,
                        name: p.name,
                        email: p.email,
                        networkConfig: (p.network_config as any)?.region || 'Default',
                        lastActive: p.last_active || p.created_at,
                        sessionsRun: p.sessions_run || 0
                      }))} 
                    />
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>

            <ExecutionPanel 
              scenarios={scenarios.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description || '',
                steps: (s.steps as any[]) || [],
                estimatedDuration: s.estimated_duration_seconds || 0,
                lastRun: s.last_run_at || undefined
              }))} 
              profiles={profiles.map(p => ({
                id: p.id,
                name: p.name,
                email: p.email,
                networkConfig: '',
                lastActive: '',
                sessionsRun: 0
              }))} 
            />
          </div>

          {/* Center Panel - Scenario Detail */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileCode className="w-4 h-4 text-primary" />
                Scenario Details
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setScenarioDialogOpen(true)}
                className="gap-1"
              >
                <Plus className="w-3 h-3" />
                New
              </Button>
            </div>
            
            {scenarios.length === 0 ? (
              <div className="glass-panel rounded-lg flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <FileCode className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No scenarios yet</p>
                <p className="text-xs">Create a scenario to start</p>
              </div>
            ) : (
              <Tabs defaultValue={scenarios[0]?.id}>
                <TabsList className="w-full bg-muted/50 flex-wrap h-auto gap-1 p-1">
                  {scenarios.map((s) => (
                    <TabsTrigger
                      key={s.id}
                      value={s.id}
                      className="text-xs px-2 py-1"
                      onClick={() => setSelectedScenario(s)}
                    >
                      {s.name.split(' ')[0]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {scenarios.map((s) => (
                  <TabsContent key={s.id} value={s.id} className="mt-3">
                    <ScenarioViewer 
                      scenario={{
                        id: s.id,
                        name: s.name,
                        description: s.description || '',
                        steps: (s.steps as any[]) || [],
                        estimatedDuration: s.estimated_duration_seconds || 0,
                        lastRun: s.last_run_at || undefined
                      }} 
                    />
                  </TabsContent>
                ))}
              </Tabs>
            )}

            {/* Data Export */}
            <DataExport />
          </div>

          {/* Right Panel - Logs/Timeline/Metrics */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {rightPanelView === 'logs' && <Terminal className="w-4 h-4 text-primary" />}
                {rightPanelView === 'timeline' && <AlignLeft className="w-4 h-4 text-primary" />}
                {rightPanelView === 'metrics' && <BarChart3 className="w-4 h-4 text-primary" />}
                {rightPanelView === 'logs' && 'Session Output'}
                {rightPanelView === 'timeline' && 'Execution Timeline'}
                {rightPanelView === 'metrics' && 'Metrics'}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={rightPanelView === 'logs' ? 'default' : 'ghost'}
                  onClick={() => setRightPanelView('logs')}
                  className="h-7 px-2"
                >
                  <Terminal className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant={rightPanelView === 'timeline' ? 'default' : 'ghost'}
                  onClick={() => setRightPanelView('timeline')}
                  className="h-7 px-2"
                >
                  <Clock className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant={rightPanelView === 'metrics' ? 'default' : 'ghost'}
                  onClick={() => setRightPanelView('metrics')}
                  className="h-7 px-2"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            
            {rightPanelView === 'logs' && (
              <>
                {selectedSession && (
                  <span className="text-xs text-muted-foreground font-mono">
                    Session: {selectedSession.id.slice(0, 8)}
                  </span>
                )}
                <LogViewer 
                  logs={formattedLogs} 
                  maxHeight="480px"
                />
              </>
            )}

            {rightPanelView === 'timeline' && (
              <SessionTimeline
                logs={logs}
                totalSteps={selectedSession?.total_steps || 0}
                currentStep={selectedSession?.current_step || 0}
              />
            )}

            {rightPanelView === 'metrics' && (
              <MetricsDashboard
                sessions={sessions}
                scenarios={scenarios}
                runners={runners}
              />
            )}
          </div>
        </div>
      </main>

      <CreateProfileDialog 
        open={profileDialogOpen} 
        onOpenChange={setProfileDialogOpen} 
      />
      <CreateScenarioDialog 
        open={scenarioDialogOpen} 
        onOpenChange={setScenarioDialogOpen} 
      />
    </div>
  );
};

export default Index;
