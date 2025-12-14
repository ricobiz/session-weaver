import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SystemStatusBanner } from '@/components/SystemStatusBanner';
import { CommandCenter } from '@/components/CommandCenter';
import { AISettingsPanel } from '@/components/AISettingsPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard, 
  Settings2, 
  Zap, 
  History,
  Activity
} from 'lucide-react';

const Operator = () => {
  const [aiModel, setAiModel] = useState(() => 
    localStorage.getItem('ai_selected_model') || 'anthropic/claude-sonnet-4-5'
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* System Status Banner - Real data */}
      <SystemStatusBanner />

      {/* Navigation */}
      <div className="border-b border-border/50">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Agent Platform</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link to="/dashboard">
                <History className="h-4 w-4" />
                History
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link to="/dashboard">
                <Activity className="h-4 w-4" />
                Processes
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link to="/dashboard">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Two column layout */}
      <main className="flex-1 container mx-auto px-4 py-6 overflow-auto">
        <div className="grid lg:grid-cols-3 gap-6 h-full">
          {/* Left: Command Center */}
          <div className="lg:col-span-2 space-y-4">
            <div className="text-center mb-6">
              <p className="text-muted-foreground">Tell me what you want. I'll handle the rest.</p>
            </div>
            <CommandCenter />
          </div>

          {/* Right: Settings Panel */}
          <div className="space-y-4 overflow-auto max-h-[calc(100vh-180px)]">
            <Tabs defaultValue="settings" className="w-full">
              <TabsList className="w-full bg-muted/50">
                <TabsTrigger value="settings" className="flex-1 gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  Settings
                </TabsTrigger>
                <TabsTrigger value="quick" className="flex-1 gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Quick Actions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="mt-3 space-y-4">
                <AISettingsPanel
                  selectedModel={aiModel}
                  onModelChange={setAiModel}
                />
              </TabsContent>

              <TabsContent value="quick" className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <Link to="/dashboard">
                      <Activity className="h-4 w-4" />
                      View Running Sessions
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <Link to="/dashboard">
                      <History className="h-4 w-4" />
                      View Task History
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <Link to="/dashboard">
                      <LayoutDashboard className="h-4 w-4" />
                      Full Dashboard
                    </Link>
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 text-center text-xs text-muted-foreground border-t border-border/50">
        System handles: scenarios, retries, captchas, runners, recovery
      </footer>
    </div>
  );
};

export default Operator;
