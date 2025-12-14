import { SystemStatusBanner } from '@/components/SystemStatusBanner';
import { CommandCenter } from '@/components/CommandCenter';

const Operator = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* System Status Banner */}
      <SystemStatusBanner />

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Agent Platform</h1>
          <p className="text-muted-foreground">Tell me what you want. I'll handle the rest.</p>
        </div>

        <CommandCenter />
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground border-t border-border/50">
        System handles: scenarios, retries, captchas, runners, recovery
      </footer>
    </div>
  );
};

export default Operator;
