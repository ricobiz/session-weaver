import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { StatCard } from '@/components/StatCard';
import { SessionCard } from '@/components/SessionCard';
import { LogViewer } from '@/components/LogViewer';
import { ScenarioViewer } from '@/components/ScenarioViewer';
import { ProfileList } from '@/components/ProfileList';
import { ProfileDetailPanel } from '@/components/ProfileDetailPanel';
import { CreateProfileDialog } from '@/components/CreateProfileDialog';
import { CreateScenarioDialog } from '@/components/CreateScenarioDialog';
import { SessionTimeline } from '@/components/SessionTimeline';
import { MetricsDashboard } from '@/components/MetricsDashboard';
import { DataExport } from '@/components/DataExport';
import { AIScenarioInsights } from '@/components/AIScenarioInsights';
import { AIFailureExplanation } from '@/components/AIFailureExplanation';
import { AIInsightsPanel } from '@/components/AIInsightsPanel';
import { TaskBuilder, TaskConfig } from '@/components/TaskBuilder';
import { TaskList } from '@/components/TaskList';
import { LiveSessionView } from '@/components/LiveSessionView';
import { GeneratedScenarioPreview } from '@/components/GeneratedScenarioPreview';
import { AISettingsPanel } from '@/components/AISettingsPanel';
import { OpenRouterBalance } from '@/components/OpenRouterBalance';
import { RunnerStatus } from '@/components/RunnerStatus';
import { RunnerTestPanel } from '@/components/RunnerTestPanel';
import { SystemSetup } from '@/components/SystemSetup';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useStats, 
  useProfiles, 
  useScenarios, 
  useSessions, 
  useSessionLogs, 
  useRunnerHealth,
  useTasks,
  useCreateTask,
  useStartTask,
  usePauseTask,
  useResumeTask,
  useStopTask,
  useDeleteTask,
  useDeleteProfile,
  useDeleteSession
} from '@/hooks/useSessionData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
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
  AlignLeft,
  Sparkles,
  Target,
  Eye,
  Settings,
  Cpu,
  Shield,
  Zap,
  Trash2,
  Fingerprint
} from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Scenario = Database['public']['Tables']['scenarios']['Row'];

const Index = () => {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles();
  const { data: scenarios = [], isLoading: scenariosLoading } = useScenarios();
  const { data: sessions = [], isLoading: sessionsLoading } = useSessions();
  const { data: runners = [] } = useRunnerHealth();
  const { data: tasks = [] } = useTasks();

  const createTaskMutation = useCreateTask();
  const startTaskMutation = useStartTask();
  const pauseTaskMutation = usePauseTask();
  const resumeTaskMutation = useResumeTask();
  const stopTaskMutation = useStopTask();
  const deleteTaskMutation = useDeleteTask();
  const deleteProfileMutation = useDeleteProfile();
  const deleteSessionMutation = useDeleteSession();
  
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);
  const [rightPanelView, setRightPanelView] = useState<'live' | 'logs' | 'timeline' | 'metrics' | 'ai' | 'settings' | 'setup' | 'profile'>('setup');
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('ai_selected_model') || 'anthropic/claude-sonnet-4-5');
  const [showSetupModal, setShowSetupModal] = useState(false);

  const selectedProfile = profiles.find(p => p.id === selectedProfileId) || null;

  const { data: logs = [] } = useSessionLogs(selectedSessionId);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);
  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const generatedScenario = selectedTask?.generated_scenario_id 
    ? scenarios.find(s => s.id === selectedTask.generated_scenario_id)
    : null;

  // Auto-select first running session for live view
  useEffect(() => {
    const runningSession = sessions.find(s => s.status === 'running');
    if (runningSession && !selectedSessionId) {
      setSelectedSessionId(runningSession.id);
    }
  }, [sessions, selectedSessionId]);

  // Convert DB logs to component format
  const formattedLogs = logs.map(log => ({
    timestamp: new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false }),
    level: log.level as 'info' | 'success' | 'warning' | 'error',
    message: log.message,
    step: log.step_index ?? undefined
  }));

  const isLoading = statsLoading || profilesLoading || scenariosLoading || sessionsLoading;

  const handleCreateTask = async (taskConfig: TaskConfig) => {
    try {
      await createTaskMutation.mutateAsync(taskConfig);
      toast({ title: 'Task Created', description: 'Task and scenario generated successfully.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create task.', variant: 'destructive' });
    }
  };

  const handleStartTask = async (taskId: string) => {
    setLoadingTaskId(taskId);
    try {
      await startTaskMutation.mutateAsync(taskId);
      toast({ title: 'Task Started', description: 'Sessions queued for execution.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to start task.', variant: 'destructive' });
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handlePauseTask = async (taskId: string) => {
    setLoadingTaskId(taskId);
    try {
      await pauseTaskMutation.mutateAsync(taskId);
      toast({ title: 'Task Paused', description: 'All sessions paused.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to pause task.', variant: 'destructive' });
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleResumeTask = async (taskId: string) => {
    setLoadingTaskId(taskId);
    try {
      await resumeTaskMutation.mutateAsync(taskId);
      toast({ title: 'Task Resumed', description: 'Sessions resumed.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to resume task.', variant: 'destructive' });
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleStopTask = async (taskId: string) => {
    setLoadingTaskId(taskId);
    try {
      await stopTaskMutation.mutateAsync(taskId);
      toast({ title: 'Task Stopped', description: 'All sessions cancelled.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to stop task.', variant: 'destructive' });
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTaskMutation.mutateAsync(taskId);
      toast({ title: 'Task Deleted', description: 'Task and sessions removed.' });
      if (selectedTaskId === taskId) setSelectedTaskId(null);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete task.', variant: 'destructive' });
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    try {
      await deleteProfileMutation.mutateAsync(profileId);
      toast({ title: 'Profile Deleted', description: 'Profile removed.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete profile.', variant: 'destructive' });
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSessionMutation.mutateAsync(sessionId);
      toast({ title: 'Session Deleted', description: 'Session removed.' });
      if (selectedSessionId === sessionId) setSelectedSessionId(null);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete session.', variant: 'destructive' });
    }
  };

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
        {/* System Setup Banner - Shows when no runners detected */}
        {runners.length === 0 && (
          <div className="mb-6 p-4 rounded-lg border-2 border-dashed border-orange-500/50 bg-orange-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Zap className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">Runner Not Connected</h3>
                  <p className="text-xs text-muted-foreground">
                    Deploy or start a runner to execute automation tasks
                  </p>
                </div>
              </div>
              <Button 
                variant="default" 
                size="sm"
                onClick={() => setShowSetupModal(true)}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Settings className="w-4 h-4" />
                Open Setup
              </Button>
            </div>
          </div>
        )}

        {/* Stats Grid - Operator focused */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <StatCard
            title="Active Tasks"
            value={tasks.filter(t => t.status === 'active').length}
            icon={Target}
            variant="primary"
          />
          <StatCard
            title="Running"
            value={stats?.activeSessions ?? 0}
            icon={Activity}
            variant="warning"
          />
          <StatCard
            title="Completed"
            value={stats?.completedToday ?? 0}
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Failed"
            value={stats?.failedToday ?? 0}
            icon={XCircle}
            variant="error"
          />
          <StatCard
            title="Profiles"
            value={stats?.totalProfiles ?? 0}
            icon={Users}
            variant="default"
          />
          <StatCard
            title="Runners"
            value={runners.length}
            icon={Cpu}
            variant={runners.length === 0 ? 'error' : 'success'}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Panel - Task Builder & Task List */}
          <div className="lg:col-span-4 space-y-4">
            <Tabs defaultValue="tasks" className="w-full">
              <TabsList className="w-full bg-muted/50">
                <TabsTrigger value="tasks" className="flex-1 gap-1.5">
                  <Target className="w-3.5 h-3.5" />
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="sessions" className="flex-1 gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Sessions
                </TabsTrigger>
                <TabsTrigger value="profiles" className="flex-1 gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Profiles
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="tasks" className="mt-3 space-y-3">
                <TaskList
                  tasks={tasks}
                  selectedTaskId={selectedTaskId || undefined}
                  onSelectTask={setSelectedTaskId}
                  onStartTask={handleStartTask}
                  onPauseTask={handlePauseTask}
                  onResumeTask={handleResumeTask}
                  onStopTask={handleStopTask}
                  onDeleteTask={handleDeleteTask}
                  loadingTaskId={loadingTaskId || undefined}
                />
              </TabsContent>

              <TabsContent value="sessions" className="mt-3">
                <ScrollArea className="h-[280px] pr-3">
                  {sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                      <Layers className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">No sessions yet</p>
                      <p className="text-xs">Create a task to start</p>
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
                            logs: [],
                            error_message: session.error_message,
                            last_successful_step: session.last_successful_step,
                          }}
                          isSelected={selectedSessionId === session.id}
                          onClick={() => setSelectedSessionId(session.id)}
                          onDelete={handleDeleteSession}
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
                <ScrollArea className="h-[240px] pr-3">
                  {profiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground">
                      <Users className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">No profiles yet</p>
                      <p className="text-xs">Add a profile to start</p>
                    </div>
                  ) : (
                    <ProfileList 
                      profiles={profiles}
                      selectedId={selectedProfileId || undefined}
                      onSelect={(profile) => {
                        setSelectedProfileId(profile.id);
                        setRightPanelView('profile');
                      }}
                      onDelete={handleDeleteProfile}
                    />
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Task Builder */}
            <TaskBuilder
              profiles={profiles.map(p => ({ id: p.id, name: p.name }))}
              onCreateTask={handleCreateTask}
              isCreating={createTaskMutation.isPending}
            />
          </div>

          {/* Center Panel - Scenario Preview / Details */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileCode className="w-4 h-4 text-primary" />
                {selectedTask ? 'Generated Scenario' : 'Scenario Details'}
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
            
            {selectedTask && generatedScenario ? (
              <>
                <GeneratedScenarioPreview
                  scenario={{
                    id: generatedScenario.id,
                    name: generatedScenario.name,
                    steps: (generatedScenario.steps as any[]) || [],
                    estimated_duration_seconds: generatedScenario.estimated_duration_seconds || 0,
                  }}
                />
                <AIScenarioInsights 
                  scenarioId={generatedScenario.id} 
                  scenarioName={generatedScenario.name} 
                />
              </>
            ) : scenarios.length === 0 ? (
              <div className="glass-panel rounded-lg flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <FileCode className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No scenarios yet</p>
                <p className="text-xs">Create a task to auto-generate</p>
              </div>
            ) : (
              <Tabs defaultValue={scenarios[0]?.id}>
                <TabsList className="w-full bg-muted/50 flex-wrap h-auto gap-1 p-1">
                  {scenarios.slice(0, 6).map((s) => (
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
                  <TabsContent key={s.id} value={s.id} className="mt-3 space-y-4">
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
                    <AIScenarioInsights 
                      scenarioId={s.id} 
                      scenarioName={s.name} 
                    />
                  </TabsContent>
                ))}
              </Tabs>
            )}

            {/* Data Export */}
            <DataExport />
          </div>

          {/* Right Panel - Live View / Logs / Metrics / AI */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {rightPanelView === 'setup' && <Zap className="w-4 h-4 text-primary" />}
                {rightPanelView === 'live' && <Eye className="w-4 h-4 text-primary" />}
                {rightPanelView === 'logs' && <Terminal className="w-4 h-4 text-primary" />}
                {rightPanelView === 'timeline' && <AlignLeft className="w-4 h-4 text-primary" />}
                {rightPanelView === 'metrics' && <BarChart3 className="w-4 h-4 text-primary" />}
                {rightPanelView === 'ai' && <Sparkles className="w-4 h-4 text-primary" />}
                {rightPanelView === 'settings' && <Settings className="w-4 h-4 text-primary" />}
                {rightPanelView === 'profile' && <Users className="w-4 h-4 text-primary" />}
                {rightPanelView === 'setup' && 'System Setup'}
                {rightPanelView === 'live' && 'Live Session'}
                {rightPanelView === 'logs' && 'Session Output'}
                {rightPanelView === 'timeline' && 'Execution Timeline'}
                {rightPanelView === 'metrics' && 'Metrics'}
                {rightPanelView === 'ai' && 'AI Insights'}
                {rightPanelView === 'settings' && 'AI Settings'}
                {rightPanelView === 'profile' && 'Agent Profile'}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={rightPanelView === 'setup' ? 'default' : 'ghost'}
                  onClick={() => setRightPanelView('setup')}
                  className="h-7 px-2"
                  title="System Setup"
                >
                  <Zap className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant={rightPanelView === 'live' ? 'default' : 'ghost'}
                  onClick={() => setRightPanelView('live')}
                  className="h-7 px-2"
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
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
                <Button
                  size="sm"
                  variant={rightPanelView === 'ai' ? 'default' : 'ghost'}
                  onClick={() => setRightPanelView('ai')}
                  className="h-7 px-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant={rightPanelView === 'settings' ? 'default' : 'ghost'}
                  onClick={() => setRightPanelView('settings')}
                  className="h-7 px-2"
                >
                  <Settings className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant={rightPanelView === 'profile' ? 'default' : 'ghost'}
                  onClick={() => setRightPanelView('profile')}
                  className="h-7 px-2"
                  title="Agent Profile"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            
            {rightPanelView === 'setup' && (
              <div className="space-y-4">
                <SystemSetup />
                <RunnerTestPanel />
              </div>
            )}

            {rightPanelView === 'live' && (
              selectedSession ? (
                <LiveSessionView
                  session={{
                    id: selectedSession.id,
                    status: selectedSession.status,
                    progress: selectedSession.progress || 0,
                    current_step: selectedSession.current_step || 0,
                    total_steps: selectedSession.total_steps || 0,
                    current_url: (selectedSession as any).current_url,
                    last_screenshot_url: (selectedSession as any).last_screenshot_url,
                    captcha_status: (selectedSession as any).captcha_status,
                    captcha_detected_at: (selectedSession as any).captcha_detected_at,
                    captcha_resolved_at: (selectedSession as any).captcha_resolved_at,
                    profile_state: (selectedSession as any).profile_state,
                    error_message: selectedSession.error_message,
                    is_resumable: selectedSession.is_resumable,
                    profiles: selectedSession.profiles,
                    scenarios: selectedSession.scenarios,
                  }}
                />
              ) : (
                <div className="glass-panel rounded-lg flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Eye className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No session selected</p>
                  <p className="text-xs">Select a session to view live status</p>
                </div>
              )
            )}

            {rightPanelView === 'logs' && (
              <>
                {selectedSession && (
                  <span className="text-xs text-muted-foreground font-mono">
                    Session: {selectedSession.id.slice(0, 8)}
                  </span>
                )}
                <LogViewer 
                  logs={formattedLogs} 
                  maxHeight="400px"
                />
                {selectedSession?.status === 'error' && (
                  <AIFailureExplanation
                    sessionId={selectedSession.id}
                    errorMessage={selectedSession.error_message}
                    isResumable={selectedSession.is_resumable}
                    lastSuccessfulStep={selectedSession.last_successful_step}
                    model={aiModel}
                  />
                )}
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

            {rightPanelView === 'ai' && (
              <AIInsightsPanel />
            )}

            {rightPanelView === 'profile' && (
              <ProfileDetailPanel 
                profile={selectedProfile}
                onClose={() => setRightPanelView('setup')}
              />
            )}

            {rightPanelView === 'settings' && (
              <div className="space-y-4">
                <OpenRouterBalance 
                  refreshInterval={30000}
                  lowBalanceThreshold={1.0}
                  onLowBalance={(balance) => {
                    toast({
                      title: 'Low OpenRouter Balance',
                      description: `Balance is $${balance.toFixed(4)}. Tasks may fail.`,
                      variant: 'destructive',
                    });
                  }}
                />
                <RunnerStatus 
                  refreshInterval={15000}
                  onRunnerDisconnect={(runnerId) => {
                    toast({
                      title: 'Runner Disconnected',
                      description: `Runner ${runnerId.slice(0, 12)}... lost connection. Sessions paused.`,
                      variant: 'destructive',
                    });
                  }}
                />
                <AISettingsPanel
                  selectedModel={aiModel}
                  onModelChange={setAiModel}
                />
              </div>
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

      {/* System Setup Modal */}
      <Dialog open={showSetupModal} onOpenChange={setShowSetupModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              System Setup
            </DialogTitle>
          </DialogHeader>
          <SystemSetup />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
