import { UserProfile } from '@/types/session';
import { User, Globe, Calendar, Hash, Trash2, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ExtendedProfile extends UserProfile {
  proxyUrl?: string | null;
  userAgent?: string | null;
}

interface ProfileListProps {
  profiles: ExtendedProfile[];
  selectedId?: string;
  onSelect?: (profile: ExtendedProfile) => void;
  onDelete?: (profileId: string) => void;
}

export function ProfileList({ profiles, selectedId, onSelect, onDelete }: ProfileListProps) {
  return (
    <div className="space-y-2">
      {profiles.map((profile, index) => (
        <div
          key={profile.id}
          onClick={() => onSelect?.(profile)}
          className={cn(
            'glass-panel rounded-lg p-3 cursor-pointer transition-all duration-200 animate-fade-in',
            'hover:border-primary/50',
            selectedId === profile.id && 'card-glow border-primary/50'
          )}
          style={{ animationDelay: `${index * 75}ms` }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm truncate">{profile.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground font-mono">
                    {profile.id.slice(-6)}
                  </span>
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(profile.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <span className="truncate max-w-[80px]">{profile.networkConfig}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  <span>{profile.sessionsRun}</span>
                </div>
                {profile.proxyUrl && (
                  <div className="flex items-center gap-1">
                    <Network className="w-3 h-3 text-green-400" />
                    <span className="text-green-400 truncate max-w-[60px]">Proxy</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
