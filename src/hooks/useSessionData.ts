import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchStats,
  fetchProfiles,
  fetchScenarios,
  fetchSessions,
  fetchSessionLogs,
  fetchRunnerHealth,
  createProfile,
  createScenario,
  subscribeToSessions,
  subscribeToLogs,
  subscribeToRunnerHealth,
  DashboardStats,
  SessionWithRelations,
  RunnerHealth
} from '@/lib/api';
import { Database } from '@/integrations/supabase/types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Scenario = Database['public']['Tables']['scenarios']['Row'];
type SessionLog = Database['public']['Tables']['session_logs']['Row'];

export function useStats() {
  return useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 5000
  });
}

export function useProfiles() {
  return useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: fetchProfiles
  });
}

export function useScenarios() {
  return useQuery<Scenario[]>({
    queryKey: ['scenarios'],
    queryFn: fetchScenarios
  });
}

export function useSessions() {
  const queryClient = useQueryClient();
  
  const query = useQuery<SessionWithRelations[]>({
    queryKey: ['sessions'],
    queryFn: () => fetchSessions(20)
  });

  useEffect(() => {
    const channel = subscribeToSessions(() => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useSessionLogs(sessionId: string | null) {
  const [logs, setLogs] = useState<SessionLog[]>([]);

  const query = useQuery<SessionLog[]>({
    queryKey: ['session-logs', sessionId],
    queryFn: () => sessionId ? fetchSessionLogs(sessionId) : Promise.resolve([]),
    enabled: !!sessionId
  });

  useEffect(() => {
    if (query.data) {
      setLogs(query.data);
    }
  }, [query.data]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = subscribeToLogs(sessionId, (payload) => {
      if (payload.new) {
        setLogs(prev => [...prev, payload.new as SessionLog]);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { ...query, data: logs };
}

export function useRunnerHealth() {
  const queryClient = useQueryClient();
  
  const query = useQuery<RunnerHealth[]>({
    queryKey: ['runner-health'],
    queryFn: fetchRunnerHealth,
    refetchInterval: 30000
  });

  useEffect(() => {
    const channel = subscribeToRunnerHealth(() => {
      queryClient.invalidateQueries({ queryKey: ['runner-health'] });
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }
  });
}

export function useCreateScenario() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createScenario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }
  });
}
