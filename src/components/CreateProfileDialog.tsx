import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateProfile } from '@/hooks/useSessionData';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface CreateProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProfileDialog({ open, onOpenChange }: CreateProfileDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');

  const createProfile = useCreateProfile();

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
        auth_checked_at: null
      });

      toast({
        title: 'Profile Created',
        description: `Profile "${name}" has been created.`
      });

      setName('');
      setEmail('');
      setRegion('');
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
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Create Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="space-y-2">
            <Label htmlFor="region">Network Region (optional)</Label>
            <Input
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="US-West-2"
              className="bg-muted/50"
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
