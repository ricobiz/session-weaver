-- Table for AI model configuration per task type
CREATE TABLE public.ai_model_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type TEXT NOT NULL UNIQUE, -- 'vision', 'reasoning', 'parsing', 'planning', 'embedding'
  primary_model TEXT NOT NULL,
  fallback_model TEXT,
  max_price_per_million_input NUMERIC(10, 4), -- max acceptable price
  max_price_per_million_output NUMERIC(10, 4),
  required_capabilities TEXT[] DEFAULT '{}', -- 'vision', 'tools', 'streaming'
  auto_update BOOLEAN DEFAULT true, -- allow system to auto-update
  last_checked_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- Insert default configurations
INSERT INTO public.ai_model_config (task_type, primary_model, fallback_model, max_price_per_million_input, required_capabilities, notes) VALUES
  ('vision', 'qwen/qwen-2.5-vl-72b-instruct', 'google/gemini-2.0-flash-exp', 0.50, ARRAY['vision'], 'Screenshot analysis, element detection'),
  ('reasoning', 'deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', 0.30, ARRAY[]::TEXT[], 'Scenario planning, decision making'),
  ('parsing', 'google/gemini-2.0-flash-exp', 'deepseek/deepseek-chat', 0.20, ARRAY[]::TEXT[], 'Log analysis, JSON parsing'),
  ('planning', 'deepseek/deepseek-chat', 'google/gemini-flash-1.5', 0.30, ARRAY['tools'], 'Task decomposition, scenario generation'),
  ('embedding', 'openai/text-embedding-3-small', NULL, 0.10, ARRAY[]::TEXT[], 'Text embeddings for search');

-- Table for model price cache (updated periodically)
CREATE TABLE public.ai_model_cache (
  id TEXT PRIMARY KEY, -- model id from OpenRouter
  name TEXT,
  pricing_input NUMERIC(12, 6), -- per million tokens
  pricing_output NUMERIC(12, 6),
  context_length INTEGER,
  capabilities TEXT[] DEFAULT '{}', -- detected capabilities
  is_free BOOLEAN DEFAULT false,
  last_updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast capability lookups
CREATE INDEX idx_ai_model_cache_capabilities ON public.ai_model_cache USING GIN(capabilities);
CREATE INDEX idx_ai_model_cache_pricing ON public.ai_model_cache (pricing_input, pricing_output);

-- Enable RLS
ALTER TABLE public.ai_model_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_cache ENABLE ROW LEVEL SECURITY;

-- Public read access (internal system tables)
CREATE POLICY "Allow public read access to model config" ON public.ai_model_config FOR SELECT USING (true);
CREATE POLICY "Allow public read access to model cache" ON public.ai_model_cache FOR SELECT USING (true);