import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { SystemStatusBanner } from '@/components/SystemStatusBanner';
import { CommandCenter } from '@/components/CommandCenter';
import { TaskProgressPanel } from '@/components/TaskProgressPanel';
import { TaskTemplates, TaskTemplate } from '@/components/TaskTemplates';
import { AISettingsPanel } from '@/components/AISettingsPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { 
  LayoutDashboard, 
  Settings2, 
  Activity,
  Bookmark,
} from 'lucide-react';

const Operator = () => {
  const [aiModel, setAiModel] = useState(() => 
    localStorage.getItem('ai_selected_model') || 'anthropic/claude-sonnet-4-5'
  );
  const [commandFromTemplate, setCommandFromTemplate] = useState('');

  const handleTaskPause = (taskId: string) => {
    toast({ title: 'Task Paused', description: 'All sessions paused.' });
  };

  const handleTaskResume = (taskId: string) => {
    toast({ title: 'Task Resumed', description: 'Sessions resuming.' });
  };

  const handleTaskStop = (taskId: string) => {
    toast({ title: 'Task Stopped', description: 'All sessions cancelled.' });
  };

  const handleTemplateSelect = (template: TaskTemplate, target: string) => {
    // Build command from template
    const parts = [
      template.goal.charAt(0).toUpperCase() + template.goal.slice(1),
      'on',
      template.platform,
    ];

    if (template.entry_method === 'url') {
      parts.push(target);
    } else {
      parts.push(`search for "${target}"`);
    }

    parts.push(`with ${template.default_profiles} profiles`);
    
    if (template.default_runs > 1) {
      parts.push(`${template.default_runs} times`);
    }

    const command = parts.join(' ');
    setCommandFromTemplate(command);
    
    toast({
      title: 'Template Applied',
      description: 'Command generated. Review and run.',
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* System Status Banner */}
      <SystemStatusBanner />

      {/* Navigation */}
      <div className="border-b border-border/50">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Agent Platform</h1>
          <Button variant="ghost" size="sm" asChild className="gap-1.5">
            <Link to="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              Full Dashboard
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 overflow-auto">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Command Center + Live Progress */}
          <div className="lg:col-span-2 space-y-6">
            {/* Command Input */}
            <div className="text-center">
              <p className="text-muted-foreground text-sm">Tell me what you want. I'll handle the rest.</p>
            </div>
            <CommandCenter 
              initialCommand={commandFromTemplate}
              onCommandUsed={() => setCommandFromTemplate('')}
            />

            {/* Live Task Progress */}
            <TaskProgressPanel
              refreshInterval={3000}
              onPauseTask={handleTaskPause}
              onResumeTask={handleTaskResume}
              onStopTask={handleTaskStop}
            />
          </div>

          {/* Right: Templates & Settings */}
          <div className="space-y-4 overflow-auto max-h-[calc(100vh-180px)]">
            <Tabs defaultValue="templates" className="w-full">
              <TabsList className="w-full bg-muted/50">
                <TabsTrigger value="templates" className="flex-1 gap-1.5">
                  <Bookmark className="w-3.5 h-3.5" />
                  Templates
                </TabsTrigger>
                <TabsTrigger value="progress" className="flex-1 gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Info
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex-1 gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="templates" className="mt-3">
                <TaskTemplates onSelectTemplate={handleTemplateSelect} />
              </TabsContent>

              <TabsContent value="progress" className="mt-3">
                <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted/20 rounded-lg">
                  <p><strong>Task progress</strong> updates every 3 seconds.</p>
                  <p><strong>Click a task</strong> to expand details and controls.</p>
                  <p><strong>Batch runs</strong> execute independently - failures don't stop other runs.</p>
                </div>
              </TabsContent>

              <TabsContent value="settings" className="mt-3 space-y-4">
                <AISettingsPanel
                  selectedModel={aiModel}
                  onModelChange={setAiModel}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 text-center text-xs text-muted-foreground border-t border-border/50">
        System handles: scenarios, retries, captchas, runners, recovery, visual detection
      </footer>
    </div>
  );
};

export default Operator;
