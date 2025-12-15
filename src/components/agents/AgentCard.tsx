import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Bot, 
  Shield, 
  Globe, 
  Mail, 
  CheckCircle2, 
  AlertCircle,
  Play,
  Settings,
  MoreVertical
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface Agent {
  id: string;
  number: number;
  email: string;
  password?: string;
  status: 'ready' | 'busy' | 'error' | 'unverified';
  profileId?: string;
  proxyId?: string;
  proxyAddress?: string;
  proxyCountry?: string;
  hasFingerprint: boolean;
  hasCookies: boolean;
  lastTaskId?: string;
  lastTaskName?: string;
  tasksCompleted: number;
  createdAt: string;
}

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onSelect?: () => void;
  onRun?: () => void;
  onConfigure?: () => void;
  onDelete?: () => void;
}

const statusConfig = {
  ready: { label: 'Готов', color: 'bg-green-500', icon: CheckCircle2 },
  busy: { label: 'Занят', color: 'bg-blue-500 animate-pulse', icon: Bot },
  error: { label: 'Ошибка', color: 'bg-destructive', icon: AlertCircle },
  unverified: { label: 'Не проверен', color: 'bg-yellow-500', icon: AlertCircle },
};

export function AgentCard({ 
  agent, 
  selected, 
  onSelect, 
  onRun, 
  onConfigure,
  onDelete 
}: AgentCardProps) {
  const status = statusConfig[agent.status];
  const StatusIcon = status.icon;

  return (
    <Card 
      className={`p-3 cursor-pointer transition-all hover:bg-accent/50 ${
        selected ? 'ring-2 ring-primary bg-accent/30' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        {/* Number Badge */}
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
          #{agent.number}
        </div>

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{agent.email}</span>
            <div className={`w-2 h-2 rounded-full ${status.color}`} title={status.label} />
          </div>
          
          {/* Status Icons */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1">
              <Shield className={`h-3 w-3 ${agent.hasFingerprint ? 'text-green-500' : 'text-muted-foreground/30'}`} />
              <Mail className={`h-3 w-3 ${agent.hasCookies ? 'text-green-500' : 'text-muted-foreground/30'}`} />
              <Globe className={`h-3 w-3 ${agent.proxyId ? 'text-green-500' : 'text-muted-foreground/30'}`} />
            </div>
            {agent.proxyCountry && (
              <span className="text-[10px] text-muted-foreground">{agent.proxyCountry}</span>
            )}
            {agent.tasksCompleted > 0 && (
              <Badge variant="secondary" className="h-4 text-[10px] px-1">
                {agent.tasksCompleted} задач
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {agent.status === 'ready' && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRun}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onConfigure}>
                <Settings className="h-3.5 w-3.5 mr-2" />
                Настроить
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
