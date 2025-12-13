import { useState } from 'react';
import { Header } from '@/components/Header';
import { StatCard } from '@/components/StatCard';
import { SessionCard } from '@/components/SessionCard';
import { LogViewer } from '@/components/LogViewer';
import { ScenarioViewer } from '@/components/ScenarioViewer';
import { ProfileList } from '@/components/ProfileList';
import { ExecutionPanel } from '@/components/ExecutionPanel';
import { mockProfiles, mockScenarios, mockSessions, mockStats } from '@/data/mockData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Users, 
  FileCode,
  Layers,
  Terminal
} from 'lucide-react';

const Index = () => {
  const [selectedSession, setSelectedSession] = useState(mockSessions[0]);
  const [selectedScenario, setSelectedScenario] = useState(mockScenarios[0]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard
            title="Active Sessions"
            value={mockStats.activeSessions}
            icon={Activity}
            variant="warning"
          />
          <StatCard
            title="Completed Today"
            value={mockStats.completedToday}
            icon={CheckCircle2}
            variant="success"
          />
          <StatCard
            title="Failed Today"
            value={mockStats.failedToday}
            icon={XCircle}
            variant="error"
          />
          <StatCard
            title="Avg Duration"
            value={mockStats.avgDuration}
            icon={Clock}
            variant="default"
          />
          <StatCard
            title="Profiles"
            value={mockStats.totalProfiles}
            icon={Users}
            variant="primary"
          />
          <StatCard
            title="Scenarios"
            value={mockStats.totalScenarios}
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
                  <div className="space-y-2">
                    {mockSessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        isSelected={selectedSession?.id === session.id}
                        onClick={() => setSelectedSession(session)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="profiles" className="mt-3">
                <ScrollArea className="h-[320px] pr-3">
                  <ProfileList profiles={mockProfiles} />
                </ScrollArea>
              </TabsContent>
            </Tabs>

            <ExecutionPanel scenarios={mockScenarios} profiles={mockProfiles} />
          </div>

          {/* Center Panel - Scenario Detail */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <FileCode className="w-4 h-4 text-primary" />
              Scenario Details
            </div>
            
            <Tabs defaultValue={mockScenarios[0].id}>
              <TabsList className="w-full bg-muted/50 flex-wrap h-auto gap-1 p-1">
                {mockScenarios.map((s) => (
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
              
              {mockScenarios.map((s) => (
                <TabsContent key={s.id} value={s.id} className="mt-3">
                  <ScenarioViewer scenario={s} />
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {/* Right Panel - Logs */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Terminal className="w-4 h-4 text-primary" />
              Session Output
              {selectedSession && (
                <span className="text-xs text-muted-foreground ml-auto font-mono">
                  {selectedSession.id.slice(-6)}
                </span>
              )}
            </div>
            
            <LogViewer 
              logs={selectedSession?.logs || []} 
              maxHeight="480px"
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
