import { LogEntry } from '@/types/session';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal } from 'lucide-react';

interface LogViewerProps {
  logs: LogEntry[];
  maxHeight?: string;
}

const levelClasses: Record<LogEntry['level'], string> = {
  info: 'log-info',
  success: 'log-success',
  warning: 'log-warning',
  error: 'log-error',
};

export function LogViewer({ logs, maxHeight = '300px' }: LogViewerProps) {
  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <Terminal className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Session Logs</span>
        <span className="text-xs text-muted-foreground ml-auto font-mono">
          {logs.length} entries
        </span>
      </div>
      <ScrollArea style={{ maxHeight }} className="scrollbar-thin">
        <div className="p-2 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-center">
              No logs available
            </p>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className="log-line flex items-start gap-2 animate-slide-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="log-timestamp shrink-0">{log.timestamp}</span>
                {log.step !== undefined && (
                  <span className="text-muted-foreground shrink-0">[{log.step}]</span>
                )}
                <span className={cn(levelClasses[log.level])}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
