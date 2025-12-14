import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  Globe, 
  Shield, 
  Wifi, 
  WifiOff,
  CheckCircle,
  XCircle,
  Clock,
  Link2
} from 'lucide-react';

type ProxyStatus = 'active' | 'inactive' | 'testing' | 'failed' | 'expired';
type ProxyType = 'http' | 'https' | 'socks4' | 'socks5' | 'residential' | 'datacenter' | 'mobile';
type ProxyProvider = 'manual' | 'bright_data' | 'oxylabs' | 'smartproxy' | 'iproyal' | 'webshare';

interface Proxy {
  id: string;
  name: string;
  provider: ProxyProvider;
  proxy_type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  country?: string;
  city?: string;
  status: ProxyStatus;
  last_check_at?: string;
  success_count: number;
  failure_count: number;
  avg_response_ms?: number;
}

const statusColors: Record<ProxyStatus, string> = {
  active: 'bg-green-500/20 text-green-400',
  inactive: 'bg-muted text-muted-foreground',
  testing: 'bg-yellow-500/20 text-yellow-400',
  failed: 'bg-red-500/20 text-red-400',
  expired: 'bg-orange-500/20 text-orange-400',
};

const providerLabels: Record<ProxyProvider, string> = {
  manual: 'Manual',
  bright_data: 'Bright Data',
  oxylabs: 'Oxylabs',
  smartproxy: 'SmartProxy',
  iproyal: 'IPRoyal',
  webshare: 'Webshare',
};

export function ProxyManager() {
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newProxy, setNewProxy] = useState({
    name: '',
    host: '',
    port: '',
    username: '',
    password: '',
    proxy_type: 'http' as ProxyType,
    country: '',
  });

  const { data: proxies = [], isLoading } = useQuery({
    queryKey: ['proxies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proxies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Proxy[];
    },
  });

  const { data: bindings = [] } = useQuery({
    queryKey: ['profile-proxy-bindings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_proxy_bindings')
        .select('*, profiles(name)');
      if (error) throw error;
      return data;
    },
  });

  const addProxy = useMutation({
    mutationFn: async (proxy: typeof newProxy) => {
      const { error } = await supabase.from('proxies').insert({
        name: proxy.name,
        host: proxy.host,
        port: parseInt(proxy.port),
        username: proxy.username || null,
        password: proxy.password || null,
        proxy_type: proxy.proxy_type,
        country: proxy.country || null,
        provider: 'manual',
        status: 'active',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      setAddDialogOpen(false);
      setNewProxy({ name: '', host: '', port: '', username: '', password: '', proxy_type: 'http', country: '' });
      toast({ title: 'Proxy Added', description: 'New proxy has been added successfully.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add proxy.', variant: 'destructive' });
    },
  });

  const deleteProxy = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('proxies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      toast({ title: 'Proxy Deleted' });
    },
  });

  const testProxy = useMutation({
    mutationFn: async (id: string) => {
      // Update status to testing
      await supabase.from('proxies').update({ status: 'testing' }).eq('id', id);
      
      // Simulate test (in real implementation, this would call an API)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Random result for demo
      const success = Math.random() > 0.3;
      const proxy = proxies.find(p => p.id === id);
      
      await supabase.from('proxies').update({ 
        status: success ? 'active' : 'failed',
        last_check_at: new Date().toISOString(),
        success_count: success ? (proxy?.success_count || 0) + 1 : proxy?.success_count || 0,
        failure_count: !success ? (proxy?.failure_count || 0) + 1 : proxy?.failure_count || 0,
      }).eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxies'] });
      toast({ title: 'Proxy Test Complete' });
    },
  });

  const getBindingsForProxy = (proxyId: string) => {
    return bindings.filter((b: any) => b.proxy_id === proxyId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Proxy Manager
        </h2>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add Proxy
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading proxies...</div>
      ) : proxies.length === 0 ? (
        <Card className="bg-muted/30">
          <CardContent className="py-8 text-center">
            <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No proxies configured</p>
            <Button className="mt-4" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Your First Proxy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {proxies.map((proxy) => {
            const proxyBindings = getBindingsForProxy(proxy.id);
            const successRate = proxy.success_count + proxy.failure_count > 0 
              ? Math.round((proxy.success_count / (proxy.success_count + proxy.failure_count)) * 100)
              : null;

            return (
              <Card key={proxy.id} className="bg-card/50 hover:bg-card/80 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${proxy.status === 'active' ? 'bg-green-500/20' : 'bg-muted'}`}>
                        {proxy.status === 'active' ? (
                          <Wifi className="w-4 h-4 text-green-400" />
                        ) : proxy.status === 'testing' ? (
                          <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />
                        ) : (
                          <WifiOff className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{proxy.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {proxy.proxy_type.toUpperCase()}
                          </Badge>
                          <Badge className={statusColors[proxy.status]}>
                            {proxy.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {proxy.host}:{proxy.port}
                          {proxy.country && ` • ${proxy.country}`}
                          {proxy.username && ' • authenticated'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {successRate !== null && (
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {successRate}%
                          </div>
                          <div className="text-xs text-muted-foreground">success</div>
                        </div>
                      )}
                      
                      {proxy.avg_response_ms && (
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {proxy.avg_response_ms}ms
                          </div>
                          <div className="text-xs text-muted-foreground">latency</div>
                        </div>
                      )}

                      {proxyBindings.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Link2 className="w-3 h-3" />
                          {proxyBindings.length} profile{proxyBindings.length > 1 ? 's' : ''}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => testProxy.mutate(proxy.id)}
                          disabled={testProxy.isPending}
                        >
                          <RefreshCw className={`w-4 h-4 ${testProxy.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteProxy.mutate(proxy.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Proxy Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Add Proxy</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addProxy.mutate(newProxy); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={newProxy.name}
                  onChange={(e) => setNewProxy({ ...newProxy, name: e.target.value })}
                  placeholder="My Proxy"
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={newProxy.proxy_type}
                  onValueChange={(v) => setNewProxy({ ...newProxy, proxy_type: v as ProxyType })}
                >
                  <SelectTrigger className="bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="https">HTTPS</SelectItem>
                    <SelectItem value="socks4">SOCKS4</SelectItem>
                    <SelectItem value="socks5">SOCKS5</SelectItem>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="datacenter">Datacenter</SelectItem>
                    <SelectItem value="mobile">Mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Host</Label>
                <Input
                  value={newProxy.host}
                  onChange={(e) => setNewProxy({ ...newProxy, host: e.target.value })}
                  placeholder="proxy.example.com"
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={newProxy.port}
                  onChange={(e) => setNewProxy({ ...newProxy, port: e.target.value })}
                  placeholder="8080"
                  className="bg-muted/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Username (optional)</Label>
                <Input
                  value={newProxy.username}
                  onChange={(e) => setNewProxy({ ...newProxy, username: e.target.value })}
                  placeholder="username"
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Password (optional)</Label>
                <Input
                  type="password"
                  value={newProxy.password}
                  onChange={(e) => setNewProxy({ ...newProxy, password: e.target.value })}
                  placeholder="password"
                  className="bg-muted/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Country (optional)</Label>
              <Input
                value={newProxy.country}
                onChange={(e) => setNewProxy({ ...newProxy, country: e.target.value })}
                placeholder="US, DE, UK..."
                className="bg-muted/50"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addProxy.isPending}>
                Add Proxy
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
