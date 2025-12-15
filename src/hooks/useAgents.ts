import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Agent } from '@/components/agents/AgentCard';
import { toast } from '@/hooks/use-toast';

// Fetch all agents
export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: async (): Promise<Agent[]> => {
      const { data, error } = await supabase
        .from('agents')
        .select(`
          *,
          profiles:profile_id (name, fingerprint, storage_state),
          proxies:proxy_id (host, port, country, status),
          tasks:last_task_id (name)
        `)
        .order('number', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map((agent: any) => ({
        id: agent.id,
        number: agent.number,
        email: agent.email,
        status: agent.status as Agent['status'],
        profileId: agent.profile_id,
        proxyId: agent.proxy_id,
        proxyAddress: agent.proxies ? `${agent.proxies.host}:${agent.proxies.port}` : undefined,
        proxyCountry: agent.proxies?.country,
        hasFingerprint: agent.has_fingerprint || !!agent.profiles?.fingerprint,
        hasCookies: agent.has_cookies || !!agent.profiles?.storage_state?.cookies?.length,
        lastTaskId: agent.last_task_id,
        lastTaskName: agent.tasks?.name,
        tasksCompleted: agent.tasks_completed || 0,
        createdAt: agent.created_at,
      }));
    },
    refetchInterval: 5000, // Auto-refresh every 5s
  });
}

// Create agents from credentials
export function useCreateAgents() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }[]) => {
      const results = [];
      
      for (const cred of credentials) {
        // 1. Create profile for the agent
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            name: cred.email.split('@')[0],
            email: cred.email,
            password_hash: cred.password, // In production, encrypt this!
          })
          .select()
          .single();
        
        if (profileError) {
          console.error('Failed to create profile:', profileError);
          continue;
        }
        
        // 2. Auto-select a proxy
        const { data: proxy } = await supabase
          .from('proxies')
          .select('id, country')
          .eq('status', 'active')
          .limit(1)
          .single();
        
        // 3. Create agent
        const { data: agent, error: agentError } = await supabase
          .from('agents')
          .insert({
            email: cred.email,
            password_encrypted: cred.password, // In production, encrypt!
            profile_id: profile.id,
            proxy_id: proxy?.id || null,
            status: 'unverified',
          })
          .select()
          .single();
        
        if (agentError) {
          console.error('Failed to create agent:', agentError);
          continue;
        }
        
        results.push(agent);
      }
      
      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({
        title: 'Агенты созданы',
        description: `Создано ${data.length} агентов`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Ошибка создания',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Delete agent
export function useDeleteAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (agentId: string) => {
      // Get agent to delete associated profile
      const { data: agent } = await supabase
        .from('agents')
        .select('profile_id')
        .eq('id', agentId)
        .single();
      
      // Delete agent
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', agentId);
      
      if (error) throw error;
      
      // Optionally delete profile
      if (agent?.profile_id) {
        await supabase
          .from('profiles')
          .delete()
          .eq('id', agent.profile_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Агент удалён' });
    },
  });
}

// Update agent status
export function useUpdateAgentStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ agentId, status }: { agentId: string; status: Agent['status'] }) => {
      const { error } = await supabase
        .from('agents')
        .update({ status })
        .eq('id', agentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

// Start swarm mode
export function useStartSwarm() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ agentIds, task }: { agentIds: string[]; task: string }) => {
      // Create a task for the swarm
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          name: `Рой: ${task.slice(0, 50)}...`,
          description: task,
          target_platform: 'multi',
          profile_ids: [],
          status: 'running',
        })
        .select()
        .single();
      
      if (taskError) throw taskError;
      
      // Update all agents to busy status and link to task
      await supabase
        .from('agents')
        .update({ 
          status: 'busy',
          last_task_id: taskData.id,
        })
        .in('id', agentIds);
      
      // Create sessions for each agent
      const sessions = agentIds.map(agentId => ({
        task_id: taskData.id,
        status: 'queued' as const,
        metadata: { agent_id: agentId, swarm_mode: true },
      }));
      
      await supabase.from('sessions').insert(sessions);
      
      return { taskId: taskData.id, agentCount: agentIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast({
        title: 'Рой запущен',
        description: `${data.agentCount} агентов выполняют задачу`,
      });
    },
  });
}
