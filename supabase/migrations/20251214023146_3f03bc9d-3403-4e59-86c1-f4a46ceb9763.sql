-- Model configuration for different tasks
CREATE TABLE public.model_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type TEXT NOT NULL UNIQUE, -- 'planning', 'vision', 'execution', 'verification'
  provider TEXT NOT NULL, -- 'lovable', 'openrouter', 'local', 'ollama'
  model_name TEXT NOT NULL,
  fallback_model TEXT,
  cost_per_1k_tokens NUMERIC(10,6) DEFAULT 0,
  max_tokens INTEGER DEFAULT 1024,
  temperature NUMERIC(3,2) DEFAULT 0.3,
  custom_endpoint TEXT, -- for local/ollama models
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Telegram bot registry
CREATE TABLE public.telegram_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  bot_token_encrypted TEXT, -- encrypted token
  username TEXT,
  webhook_url TEXT,
  automation_bot_id UUID REFERENCES public.automation_bots(id),
  status TEXT DEFAULT 'pending', -- 'pending', 'active', 'error'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Cost tracking
CREATE TABLE public.ai_usage_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.sessions(id),
  task_type TEXT NOT NULL,
  model_used TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.model_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on model_config" ON public.model_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on telegram_bots" ON public.telegram_bots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on ai_usage_log" ON public.ai_usage_log FOR ALL USING (true) WITH CHECK (true);

-- Triggers
CREATE TRIGGER update_model_config_updated_at BEFORE UPDATE ON public.model_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_telegram_bots_updated_at BEFORE UPDATE ON public.telegram_bots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default model configurations (cost-optimized)
INSERT INTO public.model_config (task_type, provider, model_name, fallback_model, cost_per_1k_tokens, max_tokens, temperature) VALUES
('planning', 'lovable', 'google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite', 0.0001, 2048, 0.4),
('vision', 'lovable', 'google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash', 0.00005, 1024, 0.2),
('execution', 'lovable', 'google/gemini-2.5-flash-lite', NULL, 0.00005, 512, 0.1),
('verification', 'local', 'rule-based', NULL, 0, 0, 0),
('bot_generation', 'lovable', 'google/gemini-2.5-flash', NULL, 0.0001, 4096, 0.3);