-- Create agents table for the "Kazarma" (Barracks) system
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  number SERIAL,
  email TEXT NOT NULL,
  password_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'unverified',
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proxy_id UUID REFERENCES public.proxies(id) ON DELETE SET NULL,
  has_fingerprint BOOLEAN DEFAULT false,
  has_cookies BOOLEAN DEFAULT false,
  last_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  tasks_completed INTEGER DEFAULT 0,
  last_verified_at TIMESTAMP WITH TIME ZONE,
  verification_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Create policy for all operations
CREATE POLICY "Allow all operations on agents" ON public.agents
  FOR ALL USING (true) WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_agents_status ON public.agents(status);
CREATE INDEX idx_agents_email ON public.agents(email);
CREATE INDEX idx_agents_profile_id ON public.agents(profile_id);

-- Create updated_at trigger
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();