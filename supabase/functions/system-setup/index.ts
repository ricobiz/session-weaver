import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ModuleStatus {
  name: string;
  status: 'pending' | 'checking' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
  action?: string;
}

interface SetupResult {
  success: boolean;
  ready: boolean;
  modules: ModuleStatus[];
  summary: string;
  timestamp: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendUpdate = async (data: Partial<SetupResult> | { module: ModuleStatus }) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // Start async processing
  (async () => {
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const modules: ModuleStatus[] = [];

      // ========================================
      // 1. Check Database Connection
      // ========================================
      await sendUpdate({ module: { name: 'database', status: 'checking', message: 'Checking database...' } });
      
      try {
        const { count, error } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        if (error) throw error;
        
        modules.push({
          name: 'database',
          status: 'success',
          message: 'Database connected',
          details: `${count || 0} profiles found`,
        });
      } catch (e) {
        modules.push({
          name: 'database',
          status: 'error',
          message: 'Database error',
          details: e instanceof Error ? e.message : 'Connection failed',
        });
      }
      await sendUpdate({ module: modules[modules.length - 1] });

      // ========================================
      // 2. Check OpenRouter API Key
      // ========================================
      await sendUpdate({ module: { name: 'openrouter', status: 'checking', message: 'Checking OpenRouter...' } });
      
      if (!OPENROUTER_API_KEY) {
        modules.push({
          name: 'openrouter',
          status: 'error',
          message: 'API key not configured',
          details: 'Add OPENROUTER_API_KEY to secrets',
          action: 'configure_secret',
        });
      } else {
        try {
          const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
            headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('OpenRouter response:', JSON.stringify(data));
            
            // OpenRouter API returns credits/limit info in data.data
            // Check various possible fields for balance
            const limitRemaining = data.data?.limit_remaining;
            const limit = data.data?.limit;
            const usage = data.data?.usage;
            
            // Calculate balance: if limit_remaining exists use it, otherwise calculate from limit - usage
            let balance = 0;
            if (typeof limitRemaining === 'number') {
              balance = limitRemaining;
            } else if (typeof limit === 'number' && typeof usage === 'number') {
              balance = limit - usage;
            } else if (typeof limit === 'number') {
              balance = limit;
            }
            
            const balanceDisplay = balance.toFixed(2);
            console.log('Calculated balance:', balance, 'Display:', balanceDisplay);
            
            modules.push({
              name: 'openrouter',
              status: balance > 0.01 ? 'success' : 'warning',
              message: balance > 0.01 ? 'OpenRouter connected' : 'Low balance',
              details: `$${balanceDisplay} remaining`,
            });
          } else {
            const errorText = await response.text();
            console.error('OpenRouter API error:', response.status, errorText);
            modules.push({
              name: 'openrouter',
              status: 'error',
              message: 'Invalid API key',
              details: 'Check your OpenRouter key',
            });
          }
        } catch (e) {
          console.error('OpenRouter connection error:', e);
          modules.push({
            name: 'openrouter',
            status: 'error',
            message: 'Connection failed',
            details: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
      await sendUpdate({ module: modules[modules.length - 1] });

      // ========================================
      // 3. Optimize AI Models
      // ========================================
      await sendUpdate({ module: { name: 'ai_models', status: 'checking', message: 'Optimizing AI models...' } });
      
      if (OPENROUTER_API_KEY) {
        try {
          // Fetch models
          const modelsResponse = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
          });
          
          if (modelsResponse.ok) {
            const modelsData = await modelsResponse.json();
            const models = modelsData.data || [];
            
            // Update cache
            const cacheUpdates = models.slice(0, 200).map((model: any) => ({
              id: model.id,
              name: model.name,
              pricing_input: parseFloat(model.pricing.prompt) * 1000000,
              pricing_output: parseFloat(model.pricing.completion) * 1000000,
              context_length: model.context_length,
              capabilities: detectCapabilities(model),
              is_free: parseFloat(model.pricing.prompt) === 0,
              last_updated_at: new Date().toISOString(),
            }));

            await supabase.from('ai_model_cache').upsert(cacheUpdates, { onConflict: 'id' });

            // Get task configs and optimize
            const { data: configs } = await supabase
              .from('ai_model_config')
              .select('*')
              .eq('auto_update', true);

            const { data: cachedModels } = await supabase
              .from('ai_model_cache')
              .select('id, pricing_input, pricing_output, capabilities, context_length')
              .order('pricing_input', { ascending: true });

            let updatedCount = 0;
            for (const config of configs || []) {
              const { primary, fallback } = findBestModel(
                cachedModels || [],
                config.required_capabilities || [],
                config.max_price_per_million_input
              );

              if (primary && primary !== config.primary_model) {
                await supabase
                  .from('ai_model_config')
                  .update({
                    primary_model: primary,
                    fallback_model: fallback,
                    last_checked_at: new Date().toISOString(),
                    last_updated_at: new Date().toISOString(),
                  })
                  .eq('task_type', config.task_type);
                updatedCount++;
              }
            }

            modules.push({
              name: 'ai_models',
              status: 'success',
              message: 'AI models optimized',
              details: `${models.length} models cached, ${updatedCount} configs updated`,
            });
          } else {
            throw new Error('Failed to fetch models');
          }
        } catch (e) {
          modules.push({
            name: 'ai_models',
            status: 'warning',
            message: 'Optimization skipped',
            details: e instanceof Error ? e.message : 'Using defaults',
          });
        }
      } else {
        modules.push({
          name: 'ai_models',
          status: 'warning',
          message: 'Skipped (no API key)',
          details: 'Configure OpenRouter first',
        });
      }
      await sendUpdate({ module: modules[modules.length - 1] });

      // ========================================
      // 4. Check Runner Status
      // ========================================
      await sendUpdate({ module: { name: 'runners', status: 'checking', message: 'Checking runners...' } });
      
      try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: runners, error } = await supabase
          .from('runner_health')
          .select('*')
          .gte('last_heartbeat', fiveMinutesAgo);

        if (error) throw error;

        const activeRunners = runners?.length || 0;
        
        modules.push({
          name: 'runners',
          status: activeRunners > 0 ? 'success' : 'warning',
          message: activeRunners > 0 ? `${activeRunners} runner(s) online` : 'No runners online',
          details: activeRunners > 0 
            ? `Ready for execution`
            : 'Start a runner to execute tasks',
          action: activeRunners === 0 ? 'start_runner' : undefined,
        });
      } catch (e) {
        modules.push({
          name: 'runners',
          status: 'error',
          message: 'Runner check failed',
          details: e instanceof Error ? e.message : 'Unknown error',
        });
      }
      await sendUpdate({ module: modules[modules.length - 1] });

      // ========================================
      // 5. Check Profiles
      // ========================================
      await sendUpdate({ module: { name: 'profiles', status: 'checking', message: 'Checking profiles...' } });
      
      try {
        const { count, error } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        if (error) throw error;

        const profileCount = count || 0;
        
        modules.push({
          name: 'profiles',
          status: profileCount > 0 ? 'success' : 'warning',
          message: profileCount > 0 ? `${profileCount} profile(s) ready` : 'No profiles',
          details: profileCount > 0 
            ? 'Ready for automation'
            : 'Create a profile to start',
          action: profileCount === 0 ? 'create_profile' : undefined,
        });
      } catch (e) {
        modules.push({
          name: 'profiles',
          status: 'error',
          message: 'Profile check failed',
          details: e instanceof Error ? e.message : 'Unknown error',
        });
      }
      await sendUpdate({ module: modules[modules.length - 1] });

      // ========================================
      // 6. Check Scenarios
      // ========================================
      await sendUpdate({ module: { name: 'scenarios', status: 'checking', message: 'Checking scenarios...' } });
      
      try {
        const { count, error } = await supabase
          .from('scenarios')
          .select('*', { count: 'exact', head: true });

        if (error) throw error;

        const scenarioCount = count || 0;
        
        modules.push({
          name: 'scenarios',
          status: scenarioCount > 0 ? 'success' : 'warning',
          message: scenarioCount > 0 ? `${scenarioCount} scenario(s)` : 'No scenarios',
          details: scenarioCount > 0 
            ? 'Ready for tasks'
            : 'Create or generate scenarios',
        });
      } catch (e) {
        modules.push({
          name: 'scenarios',
          status: 'error',
          message: 'Scenario check failed',
          details: e instanceof Error ? e.message : 'Unknown error',
        });
      }
      await sendUpdate({ module: modules[modules.length - 1] });

      // ========================================
      // Final Summary
      // ========================================
      const errors = modules.filter(m => m.status === 'error').length;
      const warnings = modules.filter(m => m.status === 'warning').length;
      const successes = modules.filter(m => m.status === 'success').length;

      const ready = errors === 0 && successes >= 3; // Database, OpenRouter, and at least one more

      let summary = '';
      if (ready && warnings === 0) {
        summary = '✓ System is fully configured and ready!';
      } else if (ready) {
        summary = `✓ System ready with ${warnings} optional item(s) to configure`;
      } else {
        summary = `${errors} critical issue(s) need attention`;
      }

      // Save diagnostic results
      await supabase.from('system_diagnostics').insert({
        component: 'system_setup',
        check_type: 'full_setup',
        status: ready ? 'healthy' : 'unhealthy',
        message: summary,
        details: { modules, errors, warnings, successes },
      });

      const finalResult: SetupResult = {
        success: true,
        ready,
        modules,
        summary,
        timestamp: new Date().toISOString(),
      };

      await sendUpdate(finalResult);
      await writer.close();
    } catch (error) {
      console.error('Setup error:', error);
      await sendUpdate({
        success: false,
        ready: false,
        modules: [],
        summary: error instanceof Error ? error.message : 'Setup failed',
        timestamp: new Date().toISOString(),
      });
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});

// Helper functions
function detectCapabilities(model: any): string[] {
  const capabilities: string[] = [];
  const id = model.id.toLowerCase();
  
  if (
    model.architecture?.input_modalities?.includes('image') ||
    id.includes('vision') || id.includes('-vl-') || id.includes('vl-') ||
    id.includes('gpt-4o') || id.includes('gemini')
  ) {
    capabilities.push('vision');
  }
  
  if (id.includes('gpt-4') || id.includes('claude') || id.includes('gemini') || 
      id.includes('qwen') || id.includes('deepseek')) {
    capabilities.push('tools');
  }
  
  if (!id.includes('embedding')) capabilities.push('streaming');
  if (id.includes('embedding') || id.includes('embed')) capabilities.push('embedding');
  
  return capabilities;
}

function findBestModel(
  models: any[],
  requiredCapabilities: string[],
  maxPriceInput: number | null
): { primary: string | null; fallback: string | null } {
  let candidates = models.filter(m => {
    if (requiredCapabilities.length === 0) return true;
    return requiredCapabilities.every(cap => m.capabilities?.includes(cap));
  });
  
  if (maxPriceInput !== null) {
    candidates = candidates.filter(m => m.pricing_input <= maxPriceInput);
  }
  
  candidates.sort((a, b) => {
    const priceA = a.pricing_input + a.pricing_output;
    const priceB = b.pricing_input + b.pricing_output;
    if (priceA !== priceB) return priceA - priceB;
    return b.context_length - a.context_length;
  });
  
  const reliableCandidates = candidates.filter(m => 
    m.pricing_input > 0.001 || 
    m.id.includes('gemini') || m.id.includes('deepseek') || m.id.includes('qwen')
  );
  
  return {
    primary: reliableCandidates[0]?.id || candidates[0]?.id || null,
    fallback: reliableCandidates[1]?.id || candidates[1]?.id || null,
  };
}
