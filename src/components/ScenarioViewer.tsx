import { Scenario } from '@/types/session';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileJson, Clock, Play, MousePointer, Heart, MessageSquare, Pause, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScenarioViewerProps {
  scenario: Scenario;
}

const actionIcons: Record<string, React.ReactNode> = {
  open: <Play className="w-3 h-3" />,
  play: <Play className="w-3 h-3" />,
  scroll: <ArrowDown className="w-3 h-3" />,
  click: <MousePointer className="w-3 h-3" />,
  like: <Heart className="w-3 h-3" />,
  comment: <MessageSquare className="w-3 h-3" />,
  wait: <Pause className="w-3 h-3" />,
};

export function ScenarioViewer({ scenario }: ScenarioViewerProps) {
  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{scenario.name}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="font-mono">~{Math.round(scenario.estimatedDuration / 60)}m</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{scenario.description}</p>
      </div>

      <ScrollArea className="max-h-[250px] scrollbar-thin">
        <div className="p-3 space-y-2">
          {scenario.steps.map((step, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-2 rounded-md bg-muted/30 animate-slide-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-mono text-primary">
                {index + 1}
              </span>
              <div className="flex items-center gap-2 text-primary/70">
                {actionIcons[step.action]}
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium capitalize">{step.action}</span>
                {step.target && (
                  <span className="text-xs text-muted-foreground ml-2 font-mono">
                    {step.target.length > 30 ? step.target.slice(0, 30) + '...' : step.target}
                  </span>
                )}
                {step.duration && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({step.duration}s)
                  </span>
                )}
                {step.text && (
                  <span className="text-xs text-muted-foreground ml-2 italic">
                    "{step.text}"
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="px-4 py-2 border-t border-border bg-muted/20">
        <pre className="text-[10px] text-muted-foreground font-mono overflow-x-auto">
          {JSON.stringify({ scenario_id: scenario.id, steps: scenario.steps.length }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
