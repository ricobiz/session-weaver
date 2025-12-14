-- Create proxy provider enum
CREATE TYPE public.proxy_provider AS ENUM (
  'manual',
  'bright_data',
  'oxylabs',
  'smartproxy',
  'iproyal',
  'webshare'
);

-- Create proxy type enum
CREATE TYPE public.proxy_type AS ENUM (
  'http',
  'https',
  'socks4',
  'socks5',
  'residential',
  'datacenter',
  'mobile'
);

-- Create proxy status enum
CREATE TYPE public.proxy_status AS ENUM (
  'active',
  'inactive',
  'testing',
  'failed',
  'expired'
);

-- Create proxies table
CREATE TABLE public.proxies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  provider proxy_provider NOT NULL DEFAULT 'manual',
  proxy_type proxy_type NOT NULL DEFAULT 'http',
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password TEXT,
  country TEXT,
  city TEXT,
  status proxy_status NOT NULL DEFAULT 'active',
  last_check_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_response_ms INTEGER,
  bandwidth_used_mb NUMERIC(10, 2) DEFAULT 0,
  bandwidth_limit_mb NUMERIC(10, 2),
  expires_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create proxy providers config table
CREATE TABLE public.proxy_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider proxy_provider NOT NULL UNIQUE,
  api_key_encrypted TEXT,
  api_endpoint TEXT,
  is_enabled BOOLEAN DEFAULT false,
  auto_rotate BOOLEAN DEFAULT true,
  rotation_interval_minutes INTEGER DEFAULT 5,
  max_concurrent INTEGER DEFAULT 10,
  settings JSONB DEFAULT '{}',
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create profile-proxy bindings table
CREATE TABLE public.profile_proxy_bindings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proxy_id UUID NOT NULL REFERENCES public.proxies(id) ON DELETE CASCADE,
  is_sticky BOOLEAN DEFAULT true,
  bound_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  session_count INTEGER DEFAULT 0,
  UNIQUE(profile_id)
);

-- Create system diagnostics table
CREATE TABLE public.system_diagnostics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component TEXT NOT NULL,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  response_time_ms INTEGER,
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add proxy_id to sessions for tracking
ALTER TABLE public.sessions 
ADD COLUMN proxy_id UUID REFERENCES public.proxies(id);

-- Update profiles to add auto-select preferences
ALTER TABLE public.profiles
ADD COLUMN auto_select_proxy BOOLEAN DEFAULT true,
ADD COLUMN preferred_proxy_type proxy_type,
ADD COLUMN preferred_country TEXT;

-- Enable RLS
ALTER TABLE public.proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_proxy_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_diagnostics ENABLE ROW LEVEL SECURITY;

-- Create policies (public access for now since no auth)
CREATE POLICY "Allow all access to proxies" ON public.proxies FOR ALL USING (true);
CREATE POLICY "Allow all access to proxy_providers" ON public.proxy_providers FOR ALL USING (true);
CREATE POLICY "Allow all access to profile_proxy_bindings" ON public.profile_proxy_bindings FOR ALL USING (true);
CREATE POLICY "Allow all access to system_diagnostics" ON public.system_diagnostics FOR ALL USING (true);

-- Create indexes
CREATE INDEX idx_proxies_status ON public.proxies(status);
CREATE INDEX idx_proxies_country ON public.proxies(country);
CREATE INDEX idx_proxies_provider ON public.proxies(provider);
CREATE INDEX idx_profile_proxy_bindings_profile ON public.profile_proxy_bindings(profile_id);
CREATE INDEX idx_system_diagnostics_component ON public.system_diagnostics(component);

-- Create triggers for updated_at
CREATE TRIGGER update_proxies_updated_at
  BEFORE UPDATE ON public.proxies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_proxy_providers_updated_at
  BEFORE UPDATE ON public.proxy_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default proxy providers
INSERT INTO public.proxy_providers (provider, api_endpoint, settings) VALUES
  ('manual', NULL, '{"description": "Manually added proxies"}'),
  ('bright_data', 'https://api.brightdata.com', '{"description": "Bright Data residential proxies"}'),
  ('oxylabs', 'https://api.oxylabs.io', '{"description": "Oxylabs proxy network"}'),
  ('smartproxy', 'https://api.smartproxy.com', '{"description": "SmartProxy residential proxies"}'),
  ('iproyal', 'https://api.iproyal.com', '{"description": "IPRoyal proxy service"}'),
  ('webshare', 'https://api.webshare.io', '{"description": "Webshare proxy service"}');

-- Create function to auto-select best proxy for profile
CREATE OR REPLACE FUNCTION public.auto_select_proxy(
  p_profile_id UUID,
  p_preferred_country TEXT DEFAULT NULL,
  p_preferred_type proxy_type DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proxy_id UUID;
  v_profile RECORD;
BEGIN
  -- Get profile preferences
  SELECT preferred_country, preferred_proxy_type, auto_select_proxy
  INTO v_profile
  FROM profiles
  WHERE id = p_profile_id;

  -- Use provided preferences or fall back to profile defaults
  p_preferred_country := COALESCE(p_preferred_country, v_profile.preferred_country);
  p_preferred_type := COALESCE(p_preferred_type, v_profile.preferred_proxy_type);

  -- First check if profile already has a sticky binding
  SELECT proxy_id INTO v_proxy_id
  FROM profile_proxy_bindings
  WHERE profile_id = p_profile_id AND is_sticky = true;

  IF v_proxy_id IS NOT NULL THEN
    -- Verify proxy is still active
    PERFORM 1 FROM proxies WHERE id = v_proxy_id AND status = 'active';
    IF FOUND THEN
      RETURN v_proxy_id;
    END IF;
  END IF;

  -- Auto-select best available proxy
  SELECT id INTO v_proxy_id
  FROM proxies
  WHERE status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
    AND (bandwidth_limit_mb IS NULL OR bandwidth_used_mb < bandwidth_limit_mb)
    AND (p_preferred_country IS NULL OR country = p_preferred_country)
    AND (p_preferred_type IS NULL OR proxy_type = p_preferred_type)
  ORDER BY 
    -- Prefer proxies with better success rate
    CASE WHEN success_count + failure_count > 0 
         THEN success_count::float / (success_count + failure_count) 
         ELSE 0.5 END DESC,
    -- Prefer faster proxies
    COALESCE(avg_response_ms, 1000) ASC,
    -- Prefer less used proxies
    success_count + failure_count ASC
  LIMIT 1;

  IF v_proxy_id IS NOT NULL THEN
    -- Create or update binding
    INSERT INTO profile_proxy_bindings (profile_id, proxy_id, is_sticky)
    VALUES (p_profile_id, v_proxy_id, true)
    ON CONFLICT (profile_id) 
    DO UPDATE SET proxy_id = v_proxy_id, bound_at = now();
  END IF;

  RETURN v_proxy_id;
END;
$$;

-- Create function to run system diagnostics
CREATE OR REPLACE FUNCTION public.run_system_diagnostic(
  p_component TEXT,
  p_check_type TEXT,
  p_status TEXT,
  p_message TEXT DEFAULT NULL,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO system_diagnostics (component, check_type, status, message, response_time_ms, details)
  VALUES (p_component, p_check_type, p_status, p_message, p_response_time_ms, p_details)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;