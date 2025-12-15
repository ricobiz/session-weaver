import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { 
  Zap, 
  Users, 
  Target,
  Play,
  Loader2,
  Bot
} from 'lucide-react';
import { Agent } from './AgentCard';

interface SwarmModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  onStartSwarm: (agentIds: string[], task: string) => void;
}

export function SwarmMode({ open, onOpenChange, agents, onStartSwarm }: SwarmModeProps) {
  const [agentCount, setAgentCount] = useState([5]);
  const [task, setTask] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  
  const readyAgents = agents.filter(a => a.status === 'ready');
  const maxAgents = Math.min(readyAgents.length, 100);
  const selectedCount = Math.min(agentCount[0], maxAgents);
  
  const handleStart = async () => {
    setIsStarting(true);
    const selectedAgents = readyAgents.slice(0, selectedCount).map(a => a.id);
    await onStartSwarm(selectedAgents, task);
    setIsStarting(false);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Режим "Рой"
          </DialogTitle>
          <DialogDescription>
            Объедините нескольких агентов для выполнения одной задачи
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Agent Count Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Количество агентов</label>
              <Badge variant="secondary" className="text-lg px-3">
                {selectedCount}
              </Badge>
            </div>
            
            <Slider
              value={agentCount}
              onValueChange={setAgentCount}
              min={1}
              max={maxAgents}
              step={1}
              className="w-full"
            />
            
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span>{maxAgents} готовых</span>
            </div>
          </div>
          
          {/* Visual representation */}
          <Card className="p-4 bg-muted/30">
            <div className="flex flex-wrap gap-1 justify-center">
              {Array.from({ length: Math.min(selectedCount, 50) }).map((_, i) => (
                <div 
                  key={i}
                  className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center"
                >
                  <Bot className="w-3 h-3 text-primary" />
                </div>
              ))}
              {selectedCount > 50 && (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                  +{selectedCount - 50}
                </div>
              )}
            </div>
            <div className="text-center mt-3 text-sm text-muted-foreground">
              <Users className="inline h-4 w-4 mr-1" />
              {selectedCount} агентов готовы к работе
            </div>
          </Card>
          
          {/* Task Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Общая задача
            </label>
            <Textarea
              placeholder="Опишите задачу для всех агентов..."
              value={task}
              onChange={e => setTask(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          
          {/* Estimated resources */}
          <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
            <span>Примерные ресурсы:</span>
            <div className="flex items-center gap-3">
              <span>~{(selectedCount * 15).toFixed(0)}% CPU</span>
              <span>~{(selectedCount * 200 / 1024).toFixed(1)} GB RAM</span>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button 
            onClick={handleStart} 
            disabled={!task.trim() || selectedCount === 0 || isStarting}
            className="gap-2"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Запуск роя...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Запустить {selectedCount} агентов
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
