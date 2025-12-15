import { Database } from '@/integrations/supabase/types';
import { User, Globe, Hash, Trash2, Network, Fingerprint, Cookie, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface ProfileListProps {
  profiles: Profile[];
  selectedId?: string;
  onSelect?: (profile: Profile) => void;
  onDelete?: (profileId: string) => void;
}

export function ProfileList({ profiles, selectedId, onSelect, onDelete }: ProfileListProps) {
  return (
    <div className="space-y-2">
      {profiles.map((profile, index) => {
        const fingerprint = profile.fingerprint as any;
        const storageState = profile.storage_state as any;
        const hasFingerprint = fingerprint && Object.keys(fingerprint).length > 0;
        const hasCookies = storageState?.cookies?.length > 0;
        const hasProxy = !!profile.proxy_url;
        
        // Extract platform from fingerprint
        const fp = fingerprint?.fingerprint || fingerprint || {};
        const platform = fp.navigator?.platform || fp.platform;

        return (
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
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                hasFingerprint ? "bg-green-500/20" : "bg-primary/20"
              )}>
                <User className={cn("w-5 h-5", hasFingerprint ? "text-green-400" : "text-primary")} />
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
                
                {/* Identity Status Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {hasFingerprint ? (
                    <Badge variant="outline" className="text-[10px] h-5 border-green-500/30 text-green-400 bg-green-500/10">
                      <Fingerprint className="w-2.5 h-2.5 mr-1" />
                      {platform || 'FP'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                      <Fingerprint className="w-2.5 h-2.5 mr-1" />
                      Новый
                    </Badge>
                  )}
                  
                  {hasCookies && (
                    <Badge variant="outline" className="text-[10px] h-5 border-blue-500/30 text-blue-400 bg-blue-500/10">
                      <Cookie className="w-2.5 h-2.5 mr-1" />
                      {storageState.cookies.length}
                    </Badge>
                  )}
                  
                  {hasProxy && (
                    <Badge variant="outline" className="text-[10px] h-5 border-purple-500/30 text-purple-400 bg-purple-500/10">
                      <Network className="w-2.5 h-2.5 mr-1" />
                      Proxy
                    </Badge>
                  )}
                  
                  {profile.auth_state === 'authenticated' && (
                    <Badge variant="outline" className="text-[10px] h-5 border-yellow-500/30 text-yellow-400 bg-yellow-500/10">
                      <Shield className="w-2.5 h-2.5 mr-1" />
                      Auth
                    </Badge>
                  )}
                </div>

                {/* Stats Row */}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    <span>{profile.sessions_run || 0} сессий</span>
                  </div>
                  {profile.last_active && (
                    <div className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      <span>{new Date(profile.last_active).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      
      {profiles.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <User className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Нет профилей</p>
          <p className="text-xs">Создайте первый профиль агента</p>
        </div>
      )}
    </div>
  );
}
