-- Add proxy and user_agent fields to profiles for persistent browser fingerprinting
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS proxy_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS user_agent text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fingerprint jsonb DEFAULT '{}'::jsonb;

-- Add index for proxy tracking
CREATE INDEX IF NOT EXISTS idx_profiles_proxy_url ON public.profiles(proxy_url) WHERE proxy_url IS NOT NULL;