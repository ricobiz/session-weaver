import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateProfile } from '@/hooks/useSessionData';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw } from 'lucide-react';

interface CreateProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// User agent templates for realistic browser fingerprinting
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
];

const generateFingerprint = () => ({
  screen: { width: 1920, height: 1080 },
  colorDepth: 24,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  language: 'en-US',
  platform: ['Win32', 'MacIntel', 'Linux x86_64'][Math.floor(Math.random() * 3)],
  webgl: `ANGLE (NVIDIA GeForce GTX ${1050 + Math.floor(Math.random() * 4) * 10})`,
  createdAt: new Date().toISOString(),
});

export function CreateProfileDialog({ open, onOpenChange }: CreateProfileDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [userAgent, setUserAgent] = useState('');

  const createProfile = useCreateProfile();

  // Generate random user agent on open
  useEffect(() => {
    if (open && !userAgent) {
      setUserAgent(USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]);
    }
  }, [open, userAgent]);

  const regenerateUserAgent = () => {
    setUserAgent(USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Name and email are required.',
        variant: 'destructive'
      });
      return;
    }

    try {
      await createProfile.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        network_config: region ? { region } : {},
        storage_state: {},
        session_context: {},
        metadata: {},
        sessions_run: 0,
        last_active: null,
        password_hash: null,
        auth_state: 'unknown',
        auth_checked_at: null,
        proxy_url: proxyUrl.trim() || null,
        user_agent: userAgent.trim() || null,
        fingerprint: generateFingerprint(),
      });

      toast({
        title: 'Profile Created',
        description: `Profile "${name}" has been created with fingerprint.`
      });

      setName('');
      setEmail('');
      setRegion('');
      setProxyUrl('');
      setUserAgent('');
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create profile.',
        variant: 'destructive'
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Profile Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Test User Alpha"
                className="bg-muted/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="test@example.com"
                className="bg-muted/50"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="region">Network Region</Label>
              <Input
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="US-West-2"
                className="bg-muted/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proxy">Proxy URL</Label>
              <Input
                id="proxy"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://user:pass@proxy:port"
                className="bg-muted/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="useragent">User Agent</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={regenerateUserAgent}
                className="h-6 text-xs gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </Button>
            </div>
            <Input
              id="useragent"
              value={userAgent}
              onChange={(e) => setUserAgent(e.target.value)}
              placeholder="Mozilla/5.0..."
              className="bg-muted/50 text-xs font-mono"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProfile.isPending}>
              {createProfile.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}