import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { 
  Rocket, 
  Target, 
  Users, 
  Clock, 
  Shuffle, 
  Play, 
  Heart, 
  MessageSquare, 
  Loader2,
  Sparkles,
  Eye
} from 'lucide-react';

interface TaskBuilderProps {
  profiles: Array<{ id: string; name: string }>;
  onCreateTask: (task: TaskConfig) => Promise<void>;
  isCreating?: boolean;
}

export interface TaskConfig {
  name: string;
  description: string;
  target_platform: string;
  entry_method: 'url' | 'search';
  target_url?: string;
  search_query?: string;
  goal_type: 'play' | 'like' | 'comment' | 'mix';
  behavior_config: {
    min_duration?: number;
    max_duration?: number;
    randomize_timing?: boolean;
    action_probability?: number;
    scroll_before_action?: boolean;
  };
  profile_ids: string[];
  run_count: number;
}

const GOAL_ICONS = {
  play: Play,
  like: Heart,
  comment: MessageSquare,
  mix: Shuffle
};

export function TaskBuilder({ profiles, onCreateTask, isCreating }: TaskBuilderProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetPlatform, setTargetPlatform] = useState('generic');
  const [entryMethod, setEntryMethod] = useState<'url' | 'search'>('url');
  const [targetUrl, setTargetUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [goalType, setGoalType] = useState<'play' | 'like' | 'comment' | 'mix'>('play');
  const [minDuration, setMinDuration] = useState(30);
  const [maxDuration, setMaxDuration] = useState(120);
  const [randomizeTiming, setRandomizeTiming] = useState(true);
  const [actionProbability, setActionProbability] = useState([80]);
  const [scrollBeforeAction, setScrollBeforeAction] = useState(true);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [runCount, setRunCount] = useState(1);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Validation Error', description: 'Task name is required.', variant: 'destructive' });
      return;
    }
    if (entryMethod === 'url' && !targetUrl.trim()) {
      toast({ title: 'Validation Error', description: 'Target URL is required.', variant: 'destructive' });
      return;
    }
    if (entryMethod === 'search' && !searchQuery.trim()) {
      toast({ title: 'Validation Error', description: 'Search query is required.', variant: 'destructive' });
      return;
    }
    if (selectedProfiles.length === 0) {
      toast({ title: 'Validation Error', description: 'Select at least one profile.', variant: 'destructive' });
      return;
    }

    const task: TaskConfig = {
      name: name.trim(),
      description: description.trim(),
      target_platform: targetPlatform,
      entry_method: entryMethod,
      target_url: entryMethod === 'url' ? targetUrl.trim() : undefined,
      search_query: entryMethod === 'search' ? searchQuery.trim() : undefined,
      goal_type: goalType,
      behavior_config: {
        min_duration: minDuration,
        max_duration: maxDuration,
        randomize_timing: randomizeTiming,
        action_probability: actionProbability[0] / 100,
        scroll_before_action: scrollBeforeAction,
      },
      profile_ids: selectedProfiles,
      run_count: runCount,
    };

    await onCreateTask(task);
  };

  const GoalIcon = GOAL_ICONS[goalType];

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="w-4 h-4 text-primary" />
          Define Task
        </CardTitle>
        <CardDescription className="text-xs">
          Describe what you want to achieve. The system will generate the execution steps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Task Identity */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Task Name</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning engagement run"
              className="h-8 text-sm bg-muted/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Platform</Label>
            <Select value={targetPlatform} onValueChange={setTargetPlatform}>
              <SelectTrigger className="h-8 text-sm bg-muted/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">Generic Web</SelectItem>
                <SelectItem value="streaming">Streaming Platform</SelectItem>
                <SelectItem value="social">Social Media</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <Textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the task goal..."
            className="h-16 text-sm bg-muted/50 resize-none"
          />
        </div>

        {/* Entry Method */}
        <div className="space-y-2">
          <Label className="text-xs">Entry Method</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={entryMethod === 'url' ? 'default' : 'outline'}
              onClick={() => setEntryMethod('url')}
              className="flex-1 h-8"
            >
              Direct URL
            </Button>
            <Button
              type="button"
              size="sm"
              variant={entryMethod === 'search' ? 'default' : 'outline'}
              onClick={() => setEntryMethod('search')}
              className="flex-1 h-8"
            >
              Search Query
            </Button>
          </div>
          {entryMethod === 'url' ? (
            <Input 
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com/content"
              className="h-8 text-sm bg-muted/50"
            />
          ) : (
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search query to find content..."
              className="h-8 text-sm bg-muted/50"
            />
          )}
        </div>

        {/* Goal Type */}
        <div className="space-y-2">
          <Label className="text-xs">Goal Type</Label>
          <div className="grid grid-cols-4 gap-2">
            {(['play', 'like', 'comment', 'mix'] as const).map((type) => {
              const Icon = GOAL_ICONS[type];
              return (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={goalType === type ? 'default' : 'outline'}
                  onClick={() => setGoalType(type)}
                  className="h-8 flex-col gap-0.5 py-1"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[10px] capitalize">{type}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Behavior Config */}
        <div className="space-y-3 p-3 rounded-lg bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Behavior Rules</Label>
            <Badge variant="outline" className="text-[10px]">
              <Sparkles className="w-2.5 h-2.5 mr-1" />
              AI-optimized
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Min Duration (s)</Label>
              <Input 
                type="number" 
                value={minDuration} 
                onChange={(e) => setMinDuration(Number(e.target.value))}
                className="h-7 text-xs bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Max Duration (s)</Label>
              <Input 
                type="number" 
                value={maxDuration} 
                onChange={(e) => setMaxDuration(Number(e.target.value))}
                className="h-7 text-xs bg-background"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground">Action Probability</Label>
              <span className="text-[10px] text-muted-foreground">{actionProbability[0]}%</span>
            </div>
            <Slider
              value={actionProbability}
              onValueChange={setActionProbability}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground">Randomize Timing</Label>
            <Switch checked={randomizeTiming} onCheckedChange={setRandomizeTiming} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground">Scroll Before Action</Label>
            <Switch checked={scrollBeforeAction} onCheckedChange={setScrollBeforeAction} />
          </div>
        </div>

        {/* Profile Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              Profiles
            </Label>
            <Button 
              type="button" 
              variant="ghost" 
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setSelectedProfiles(profiles.map(p => p.id))}
            >
              Select All
            </Button>
          </div>
          <ScrollArea className="h-24 rounded border border-border bg-muted/30 p-2">
            <div className="space-y-1">
              {profiles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No profiles available</p>
              ) : (
                profiles.map((profile) => (
                  <div 
                    key={profile.id}
                    className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                      selectedProfiles.includes(profile.id) 
                        ? 'bg-primary/20 border border-primary/30' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      setSelectedProfiles(prev => 
                        prev.includes(profile.id)
                          ? prev.filter(id => id !== profile.id)
                          : [...prev, profile.id]
                      );
                    }}
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      selectedProfiles.includes(profile.id) ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`} />
                    <span className="text-xs">{profile.name}</span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Runs per profile:</Label>
            <Input 
              type="number" 
              value={runCount}
              onChange={(e) => setRunCount(Math.max(1, Number(e.target.value)))}
              min={1}
              className="h-7 w-16 text-xs bg-muted/50"
            />
          </div>
        </div>

        {/* Submit */}
        <Button 
          onClick={handleSubmit} 
          disabled={isCreating}
          className="w-full gap-2"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4" />
          )}
          Create Task & Generate Scenario
        </Button>
      </CardContent>
    </Card>
  );
}
