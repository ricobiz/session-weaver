import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, 
  Plus, 
  Upload, 
  Zap, 
  Search,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Filter
} from 'lucide-react';
import { AgentCard, Agent } from './AgentCard';
import { CredentialsImport } from './CredentialsImport';
import { SwarmMode } from './SwarmMode';
import { toast } from '@/hooks/use-toast';

interface AgentHubProps {
  agents: Agent[];
  onAgentCreate: (credentials: { email: string; password: string }[]) => Promise<void>;
  onAgentRun: (agentId: string) => void;
  onAgentDelete: (agentId: string) => void;
  onSwarmStart: (agentIds: string[], task: string) => void;
  isLoading?: boolean;
}

export function AgentHub({ 
  agents, 
  onAgentCreate, 
  onAgentRun, 
  onAgentDelete,
  onSwarmStart,
  isLoading 
}: AgentHubProps) {
  const [importOpen, setImportOpen] = useState(false);
  const [swarmOpen, setSwarmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  
  // Filter agents
  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const matchesSearch = agent.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [agents, searchQuery, statusFilter]);
  
  // Stats
  const stats = useMemo(() => ({
    total: agents.length,
    ready: agents.filter(a => a.status === 'ready').length,
    busy: agents.filter(a => a.status === 'busy').length,
    error: agents.filter(a => a.status === 'error').length,
    unverified: agents.filter(a => a.status === 'unverified').length,
  }), [agents]);
  
  const handleSelectAgent = (agentId: string) => {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };
  
  const handleSelectAll = () => {
    if (selectedAgents.size === filteredAgents.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(filteredAgents.map(a => a.id)));
    }
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">Казарма агентов</h2>
              <p className="text-xs text-muted-foreground">{stats.total} агентов</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1.5"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              Импорт
            </Button>
            <Button 
              size="sm" 
              className="gap-1.5"
              onClick={() => setSwarmOpen(true)}
              disabled={stats.ready === 0}
            >
              <Zap className="h-3.5 w-3.5" />
              Рой
            </Button>
          </div>
        </div>
        
        {/* Stats Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge 
            variant={statusFilter === 'all' ? 'default' : 'secondary'}
            className="cursor-pointer"
            onClick={() => setStatusFilter('all')}
          >
            <Users className="h-3 w-3 mr-1" />
            Все {stats.total}
          </Badge>
          <Badge 
            variant={statusFilter === 'ready' ? 'default' : 'secondary'}
            className="cursor-pointer bg-green-500/10 text-green-500 hover:bg-green-500/20"
            onClick={() => setStatusFilter('ready')}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Готовы {stats.ready}
          </Badge>
          <Badge 
            variant={statusFilter === 'busy' ? 'default' : 'secondary'}
            className="cursor-pointer bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
            onClick={() => setStatusFilter('busy')}
          >
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Заняты {stats.busy}
          </Badge>
          {stats.error > 0 && (
            <Badge 
              variant={statusFilter === 'error' ? 'default' : 'secondary'}
              className="cursor-pointer bg-destructive/10 text-destructive hover:bg-destructive/20"
              onClick={() => setStatusFilter('error')}
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Ошибки {stats.error}
            </Badge>
          )}
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
        
        {/* Selection actions */}
        {selectedAgents.size > 0 && (
          <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
            <span className="text-sm text-muted-foreground">
              Выбрано: {selectedAgents.size}
            </span>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleSelectAll}>
              {selectedAgents.size === filteredAgents.length ? 'Снять всё' : 'Выбрать всё'}
            </Button>
            <Button 
              size="sm" 
              variant="secondary" 
              className="h-6 text-xs gap-1 ml-auto"
              onClick={() => {
                const selectedReady = agents.filter(a => 
                  selectedAgents.has(a.id) && a.status === 'ready'
                );
                if (selectedReady.length > 0) {
                  setSwarmOpen(true);
                } else {
                  toast({
                    title: "Нет готовых агентов",
                    description: "Выберите агентов со статусом 'Готов'",
                    variant: "destructive"
                  });
                }
              }}
            >
              <Zap className="h-3 w-3" />
              Запустить выбранных
            </Button>
          </div>
        )}
      </div>
      
      {/* Agent List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">
                {agents.length === 0 
                  ? 'Нет агентов. Импортируйте учётные данные.' 
                  : 'Агенты не найдены'}
              </p>
              {agents.length === 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={() => setImportOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Импортировать
                </Button>
              )}
            </div>
          ) : (
            filteredAgents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                selected={selectedAgents.has(agent.id)}
                onSelect={() => handleSelectAgent(agent.id)}
                onRun={() => onAgentRun(agent.id)}
                onDelete={() => onAgentDelete(agent.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
      
      {/* Dialogs */}
      <CredentialsImport
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={onAgentCreate}
      />
      
      <SwarmMode
        open={swarmOpen}
        onOpenChange={setSwarmOpen}
        agents={agents}
        onStartSwarm={onSwarmStart}
      />
    </div>
  );
}
