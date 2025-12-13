-- Enum for session status
CREATE TYPE public.session_status AS ENUM ('idle', 'queued', 'running', 'paused', 'success', 'error', 'cancelled');

-- Enum for log levels
CREATE TYPE public.log_level AS ENUM ('debug', 'info', 'warning', 'error', 'success');

-- Profiles table: stores user profile configurations for session execution
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT, -- Stored encrypted, not plaintext
  network_config JSONB DEFAULT '{}',
  storage_state JSONB DEFAULT '{}', -- Playwright storage state (cookies, localStorage)
  session_context JSONB DEFAULT '{}', -- Additional session context
  metadata JSONB DEFAULT '{}',
  sessions_run INTEGER DEFAULT 0,
  last_active TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Scenarios table: stores scenario definitions
CREATE TABLE public.scenarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]', -- Array of scenario steps
  estimated_duration_seconds INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  last_run_at TIMESTAMP WITH TIME ZONE,
  run_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sessions table: stores execution session instances
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scenario_id UUID REFERENCES public.scenarios(id) ON DELETE SET NULL,
  status session_status NOT NULL DEFAULT 'idle',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  error_message TEXT,
  runner_id TEXT, -- Identifier of the Playwright runner instance
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  execution_time_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Session logs table: stores detailed execution logs
CREATE TABLE public.session_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  level log_level NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  step_index INTEGER,
  action TEXT,
  details JSONB DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Scheduler config table: stores scheduler configuration
CREATE TABLE public.scheduler_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  max_concurrency INTEGER DEFAULT 5,
  min_delay_ms INTEGER DEFAULT 1000,
  max_delay_ms INTEGER DEFAULT 5000,
  retry_on_failure BOOLEAN DEFAULT true,
  max_retries INTEGER DEFAULT 3,
  randomize_delays BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Execution queue table: queue for pending session executions
CREATE TABLE public.execution_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  claimed_by TEXT, -- Runner ID that claimed this job
  claimed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables (public access for API, auth can be added later)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_queue ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (for API access - can be restricted with auth later)
CREATE POLICY "Allow all operations on profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on scenarios" ON public.scenarios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sessions" ON public.sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on session_logs" ON public.session_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on scheduler_config" ON public.scheduler_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on execution_queue" ON public.execution_queue FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for sessions and logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_logs;

-- Set replica identity for realtime updates
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.session_logs REPLICA IDENTITY FULL;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scenarios_updated_at BEFORE UPDATE ON public.scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default scheduler config
INSERT INTO public.scheduler_config (max_concurrency, min_delay_ms, max_delay_ms, randomize_delays) 
VALUES (5, 1000, 5000, true);

-- Create indexes for performance
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX idx_sessions_profile ON public.sessions(profile_id);
CREATE INDEX idx_sessions_scenario ON public.sessions(scenario_id);
CREATE INDEX idx_session_logs_session ON public.session_logs(session_id);
CREATE INDEX idx_session_logs_timestamp ON public.session_logs(timestamp DESC);
CREATE INDEX idx_execution_queue_priority ON public.execution_queue(priority DESC, created_at ASC);