import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Bookmark,
  Play,
  Music,
  Video,
  Heart,
  MessageCircle,
  Search,
  Link,
  ChevronRight,
} from 'lucide-react';

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  platform: string;
  goal: string;
  entry_method: 'url' | 'search';
  default_profiles: number;
  default_runs: number;
  behavior: {
    min_duration: number;
    max_duration: number;
    randomize: boolean;
  };
  icon: React.ReactNode;
  color: string;
}

const TEMPLATES: TaskTemplate[] = [
  {
    id: 'spotify-play-url',
    name: 'Play Spotify Track',
    description: 'Play a Spotify track via direct link',
    platform: 'spotify',
    goal: 'play',
    entry_method: 'url',
    default_profiles: 5,
    default_runs: 1,
    behavior: { min_duration: 60, max_duration: 180, randomize: true },
    icon: <Music className="h-4 w-4" />,
    color: 'bg-green-500/20 text-green-400',
  },
  {
    id: 'spotify-play-search',
    name: 'Search & Play Spotify',
    description: 'Search for a track and play it',
    platform: 'spotify',
    goal: 'play',
    entry_method: 'search',
    default_profiles: 5,
    default_runs: 1,
    behavior: { min_duration: 60, max_duration: 180, randomize: true },
    icon: <Search className="h-4 w-4" />,
    color: 'bg-green-500/20 text-green-400',
  },
  {
    id: 'youtube-watch',
    name: 'Watch YouTube Video',
    description: 'Watch a YouTube video via link',
    platform: 'youtube',
    goal: 'play',
    entry_method: 'url',
    default_profiles: 3,
    default_runs: 1,
    behavior: { min_duration: 120, max_duration: 300, randomize: true },
    icon: <Video className="h-4 w-4" />,
    color: 'bg-red-500/20 text-red-400',
  },
  {
    id: 'youtube-like',
    name: 'Like YouTube Video',
    description: 'Watch and like a video',
    platform: 'youtube',
    goal: 'like',
    entry_method: 'url',
    default_profiles: 3,
    default_runs: 1,
    behavior: { min_duration: 30, max_duration: 60, randomize: true },
    icon: <Heart className="h-4 w-4" />,
    color: 'bg-red-500/20 text-red-400',
  },
  {
    id: 'tiktok-watch',
    name: 'Watch TikTok',
    description: 'Watch TikTok videos',
    platform: 'tiktok',
    goal: 'play',
    entry_method: 'url',
    default_profiles: 5,
    default_runs: 3,
    behavior: { min_duration: 15, max_duration: 45, randomize: true },
    icon: <Video className="h-4 w-4" />,
    color: 'bg-pink-500/20 text-pink-400',
  },
  {
    id: 'tiktok-like',
    name: 'Like TikTok',
    description: 'Watch and like a TikTok',
    platform: 'tiktok',
    goal: 'like',
    entry_method: 'url',
    default_profiles: 5,
    default_runs: 1,
    behavior: { min_duration: 10, max_duration: 30, randomize: true },
    icon: <Heart className="h-4 w-4" />,
    color: 'bg-pink-500/20 text-pink-400',
  },
  {
    id: 'soundcloud-play',
    name: 'Play SoundCloud Track',
    description: 'Play a SoundCloud track',
    platform: 'soundcloud',
    goal: 'play',
    entry_method: 'url',
    default_profiles: 5,
    default_runs: 1,
    behavior: { min_duration: 60, max_duration: 180, randomize: true },
    icon: <Music className="h-4 w-4" />,
    color: 'bg-orange-500/20 text-orange-400',
  },
];

interface TaskTemplatesProps {
  onSelectTemplate: (template: TaskTemplate, target: string) => void;
}

export function TaskTemplates({ onSelectTemplate }: TaskTemplatesProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [target, setTarget] = useState('');

  const handleSelect = (template: TaskTemplate) => {
    setSelectedTemplate(template);
    setTarget('');
  };

  const handleApply = () => {
    if (selectedTemplate && target.trim()) {
      onSelectTemplate(selectedTemplate, target);
      setSelectedTemplate(null);
      setTarget('');
    }
  };

  const getPlaceholder = () => {
    if (!selectedTemplate) return '';
    return selectedTemplate.entry_method === 'url'
      ? 'Paste URL here...'
      : 'Enter search query...';
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          Quick Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!selectedTemplate ? (
          <ScrollArea className="h-[200px]">
            <div className="space-y-1">
              {TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className={`p-2 rounded-lg ${template.color}`}>
                    {template.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{template.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {template.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {template.entry_method === 'url' ? <Link className="h-3 w-3 mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                      {template.entry_method}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="space-y-3">
            {/* Selected Template Preview */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <div className={`p-2 rounded-lg ${selectedTemplate.color}`}>
                {selectedTemplate.icon}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{selectedTemplate.name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedTemplate.default_profiles} profiles × {selectedTemplate.default_runs} runs
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTemplate(null)}
              >
                Change
              </Button>
            </div>

            {/* Target Input */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                {selectedTemplate.entry_method === 'url' ? 'Target URL' : 'Search Query'}
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder={getPlaceholder()}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleApply}
                  disabled={!target.trim()}
                  className="gap-1"
                >
                  <Play className="h-4 w-4" />
                  Apply
                </Button>
              </div>
            </div>

            {/* Behavior Preview (read-only) */}
            <div className="text-xs text-muted-foreground bg-muted/20 rounded p-2 space-y-1">
              <div className="font-medium text-foreground">Behavior:</div>
              <div>• Duration: {selectedTemplate.behavior.min_duration}-{selectedTemplate.behavior.max_duration}s</div>
              <div>• Timing: {selectedTemplate.behavior.randomize ? 'Randomized' : 'Fixed'}</div>
              <div>• Goal: {selectedTemplate.goal}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
