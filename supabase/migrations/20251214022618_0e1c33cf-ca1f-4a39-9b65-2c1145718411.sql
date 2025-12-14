-- Table for AI-generated automation bots (clicker scenarios)
CREATE TABLE public.automation_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by_task_id UUID REFERENCES public.tasks(id),
  scenario_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_platform TEXT NOT NULL,
  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_execution_time_ms INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for action verification evidence
CREATE TABLE public.action_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id),
  action_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  verification_type TEXT NOT NULL, -- 'screenshot_diff', 'dom_change', 'network_request', 'url_change', 'element_state'
  verified BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC(3,2) DEFAULT 0, -- 0.00-1.00
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_state JSONB,
  after_state JSONB,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automation_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_verifications ENABLE ROW LEVEL SECURITY;

-- RLS policies (permissive for internal system use)
CREATE POLICY "Allow all operations on automation_bots" ON public.automation_bots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on action_verifications" ON public.action_verifications FOR ALL USING (true) WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_automation_bots_updated_at
BEFORE UPDATE ON public.automation_bots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to sessions for bot execution
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS automation_bot_id UUID REFERENCES public.automation_bots(id);
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS verification_score NUMERIC(3,2) DEFAULT 0;