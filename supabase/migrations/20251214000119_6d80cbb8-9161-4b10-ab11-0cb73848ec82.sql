-- Tasks table for operator goals/campaigns
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  target_platform text NOT NULL,
  entry_method text NOT NULL DEFAULT 'url', -- 'url' or 'search'
  target_url text,
  search_query text,
  goal_type text NOT NULL DEFAULT 'play', -- 'play', 'like', 'comment', 'mix'
  behavior_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_ids uuid[] DEFAULT '{}',
  run_count integer DEFAULT 1,
  status text NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
  generated_scenario_id uuid REFERENCES public.scenarios(id),
  sessions_created integer DEFAULT 0,
  sessions_completed integer DEFAULT 0,
  sessions_failed integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS policy for tasks
CREATE POLICY "Allow all operations on tasks" ON public.tasks
  FOR ALL USING (true) WITH CHECK (true);

-- Add captcha tracking columns to sessions
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id),
ADD COLUMN IF NOT EXISTS captcha_status text DEFAULT null,
ADD COLUMN IF NOT EXISTS captcha_detected_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS captcha_resolved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS current_url text,
ADD COLUMN IF NOT EXISTS last_screenshot_url text,
ADD COLUMN IF NOT EXISTS profile_state text DEFAULT 'unknown';

-- Add profile state tracking
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS auth_state text DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS auth_checked_at timestamp with time zone;

-- Trigger for tasks updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for tasks and sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;