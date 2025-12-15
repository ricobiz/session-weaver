import { useState } from 'react';
import { Database } from '@/integrations/supabase/types';
import { 
  User, 
  Globe, 
  Fingerprint, 
  Cookie, 
  Network, 
  Monitor,
  Cpu,
  Palette,
  Languages,
  Shield,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface ProfileDetailPanelProps {
  profile: Profile | null;
  onClose?: () => void;
  onRefreshFingerprint?: (profileId: string) => void;
}

export function ProfileDetailPanel({ profile, onClose, onRefreshFingerprint }: ProfileDetailPanelProps) {
  const [showRawFingerprint, setShowRawFingerprint] = useState(false);

  if (!profile) {
    return (
      <div className="glass-panel rounded-lg p-6 text-center text-muted-foreground">
        <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Выберите профиль для просмотра деталей</p>
      </div>
    );
  }

  const fingerprint = profile.fingerprint as any;
  const storageState = profile.storage_state as any;
  const networkConfig = profile.network_config as any;

  const hasFingerprint = fingerprint && Object.keys(fingerprint).length > 0;
  const hasStorageState = storageState && (storageState.cookies?.length > 0 || storageState.origins?.length > 0);
  const hasCookies = storageState?.cookies?.length > 0;
  const hasLocalStorage = storageState?.origins?.length > 0;

  // Extract fingerprint details
  const fp = fingerprint?.fingerprint || fingerprint || {};
  const nav = fp.navigator || {};
  const screen = fp.screen || {};
  const webgl = fp.webgl || {};

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Скопировано', description: `${label} скопирован в буфер` });
  };

  return (
    <div className="glass-panel rounded-lg p-4 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{profile.name}</h3>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={hasFingerprint ? 'default' : 'secondary'}>
            {hasFingerprint ? 'Идентичность сохранена' : 'Новый профиль'}
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Identity Status */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard
          icon={Fingerprint}
          label="Fingerprint"
          status={hasFingerprint}
          detail={hasFingerprint ? nav.platform || 'Сохранён' : 'Не создан'}
        />
        <StatusCard
          icon={Cookie}
          label="Cookies"
          status={hasCookies}
          detail={hasCookies ? `${storageState.cookies.length} cookies` : 'Нет'}
        />
        <StatusCard
          icon={Network}
          label="Proxy"
          status={!!profile.proxy_url}
          detail={profile.proxy_url ? 'Привязан' : 'Не привязан'}
        />
        <StatusCard
          icon={Shield}
          label="Auth State"
          status={profile.auth_state === 'authenticated'}
          detail={profile.auth_state || 'unknown'}
        />
      </div>

      {/* Fingerprint Details */}
      {hasFingerprint && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2">
                <Fingerprint className="w-4 h-4" />
                Детали Fingerprint
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRawFingerprint(!showRawFingerprint)}
              >
                {showRawFingerprint ? 'Скрыть JSON' : 'Показать JSON'}
              </Button>
            </div>

            {showRawFingerprint ? (
              <div className="relative">
                <pre className="bg-background/50 rounded-lg p-3 text-xs overflow-auto max-h-48 font-mono">
                  {JSON.stringify(fingerprint, null, 2)}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(JSON.stringify(fingerprint, null, 2), 'Fingerprint')}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <FingerprintRow icon={Monitor} label="Экран" value={`${screen.width || '?'}x${screen.height || '?'}`} />
                <FingerprintRow icon={Cpu} label="CPU Cores" value={nav.hardwareConcurrency || '?'} />
                <FingerprintRow icon={Palette} label="Color Depth" value={screen.colorDepth || '?'} />
                <FingerprintRow icon={Languages} label="Язык" value={nav.language || 'en-US'} />
                <FingerprintRow 
                  icon={Globe} 
                  label="Platform" 
                  value={nav.platform || '?'} 
                  className="col-span-2"
                />
                <FingerprintRow 
                  icon={Shield} 
                  label="WebGL" 
                  value={webgl.vendor?.substring(0, 30) || 'N/A'} 
                  className="col-span-2"
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* User Agent */}
      {(profile.user_agent || nav.userAgent) && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="font-medium text-sm">User Agent</h4>
            <p className="text-xs text-muted-foreground bg-background/50 rounded p-2 font-mono break-all">
              {profile.user_agent || nav.userAgent}
            </p>
          </div>
        </>
      )}

      {/* Storage State Summary */}
      {hasStorageState && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <Cookie className="w-4 h-4" />
              Сохранённое состояние
            </h4>
            <div className="flex flex-wrap gap-2">
              {hasCookies && (
                <Badge variant="outline">
                  {storageState.cookies.length} cookies
                </Badge>
              )}
              {hasLocalStorage && (
                <Badge variant="outline">
                  {storageState.origins.length} domains с localStorage
                </Badge>
              )}
            </div>
            {hasCookies && (
              <div className="text-xs text-muted-foreground">
                Домены: {[...new Set(storageState.cookies.map((c: any) => c.domain))].slice(0, 5).join(', ')}
                {storageState.cookies.length > 5 && '...'}
              </div>
            )}
          </div>
        </>
      )}

      {/* Actions */}
      <Separator />
      <div className="flex gap-2">
        {onRefreshFingerprint && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRefreshFingerprint(profile.id)}
            className="flex-1"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Обновить Fingerprint
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusCard({ 
  icon: Icon, 
  label, 
  status, 
  detail 
}: { 
  icon: any; 
  label: string; 
  status: boolean; 
  detail: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg border",
      status ? "border-green-500/30 bg-green-500/5" : "border-muted bg-muted/5"
    )}>
      <Icon className={cn("w-4 h-4", status ? "text-green-400" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className={cn("text-xs truncate", status ? "text-green-400" : "text-muted-foreground")}>
          {detail}
        </p>
      </div>
      {status ? (
        <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
      ) : (
        <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

function FingerprintRow({ 
  icon: Icon, 
  label, 
  value,
  className 
}: { 
  icon: any; 
  label: string; 
  value: string | number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 p-2 bg-background/30 rounded", className)}>
      <Icon className="w-3 h-3 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
