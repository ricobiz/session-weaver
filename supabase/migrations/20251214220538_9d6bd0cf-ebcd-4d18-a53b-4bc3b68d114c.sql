-- Create table to store Railway configuration
CREATE TABLE IF NOT EXISTS public.railway_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  project_id TEXT NOT NULL,
  service_id TEXT,
  environment_id TEXT,
  runner_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default config with the working project
INSERT INTO public.railway_config (id, project_id, service_id, runner_url)
VALUES (
  'default',
  '083ddcb7-7565-436a-b963-4d3e0dc57155',
  'b4f50433-bfeb-4a9a-b7d2-b63883dec955',
  'https://runner-production-72af.up.railway.app'
) ON CONFLICT (id) DO UPDATE SET
  project_id = EXCLUDED.project_id,
  service_id = EXCLUDED.service_id,
  runner_url = EXCLUDED.runner_url,
  updated_at = now();

-- RLS - allow public read/write for now (no auth in this app)
ALTER TABLE public.railway_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to railway_config"
ON public.railway_config
FOR ALL
USING (true)
WITH CHECK (true);