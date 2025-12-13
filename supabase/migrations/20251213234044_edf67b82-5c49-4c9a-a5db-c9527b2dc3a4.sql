-- Add retry and resume metadata columns to sessions table
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_successful_step integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_resumable boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS resume_metadata jsonb DEFAULT '{}'::jsonb;

-- Add step duration tracking to session_logs
ALTER TABLE public.session_logs
ADD COLUMN IF NOT EXISTS duration_ms integer DEFAULT NULL;

-- Add runner health tracking table
CREATE TABLE IF NOT EXISTS public.runner_health (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  runner_id text NOT NULL UNIQUE,
  last_heartbeat timestamp with time zone NOT NULL DEFAULT now(),
  active_sessions integer DEFAULT 0,
  total_sessions_executed integer DEFAULT 0,
  total_failures integer DEFAULT 0,
  uptime_seconds integer DEFAULT 0,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS on runner_health
ALTER TABLE public.runner_health ENABLE ROW LEVEL SECURITY;

-- Allow all operations on runner_health
CREATE POLICY "Allow all operations on runner_health"
ON public.runner_health
AS RESTRICTIVE
FOR ALL
USING (true)
WITH CHECK (true);

-- Add scenario validation columns
ALTER TABLE public.scenarios
ADD COLUMN IF NOT EXISTS is_valid boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS validation_errors jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS avg_duration_ms integer DEFAULT NULL;

-- Create function to increment profile sessions (if not exists)
CREATE OR REPLACE FUNCTION public.increment_profile_sessions(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles 
  SET sessions_run = COALESCE(sessions_run, 0) + 1,
      last_active = now()
  WHERE id = p_id;
END;
$$;

-- Enable realtime for runner_health
ALTER PUBLICATION supabase_realtime ADD TABLE public.runner_health;