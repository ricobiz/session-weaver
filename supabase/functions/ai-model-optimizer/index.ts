import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: {
    is_moderated?: boolean;
  };
}

interface TaskConfig {
  task_type: string;
  primary_model: string;
  fallback_model: string | null;
  max_price_per_million_input: number | null;
  required_capabilities: string[];
  auto_update: boolean;
}

// Detect capabilities from model metadata
function detectCapabilities(model: OpenRouterModel): string[] {
  const capabilities: string[] = [];
  const id = model.id.toLowerCase();
  const name = model.name.toLowerCase();
  
  // Vision capability
  if (
    model.architecture?.input_modalities?.includes('image') ||
    id.includes('vision') ||
    id.includes('-vl-') ||
    id.includes('vl-') ||
    name.includes('vision') ||
    id.includes('gpt-4o') ||
    id.includes('gemini')
  ) {
    capabilities.push('vision');
  }
  
  // Tools/Function calling
  if (
    id.includes('gpt-4') ||
    id.includes('claude') ||
    id.includes('gemini') ||
    id.includes('qwen') ||
    id.includes('deepseek')
  ) {
    capabilities.push('tools');
  }
  
  // Streaming (most modern models support it)
  if (!id.includes('embedding')) {
    capabilities.push('streaming');
  }
  
  // Embedding models
  if (id.includes('embedding') || id.includes('embed')) {
    capabilities.push('embedding');
  }
  
  return capabilities;
}

// Find best model for a task type
function findBestModel(
  models: Array<{
    id: string;
    pricing_input: number;
    pricing_output: number;
    capabilities: string[];
    context_length: number;
  }>,
  requiredCapabilities: string[],
  maxPriceInput: number | null
): { primary: string | null; fallback: string | null } {
  // Filter models that have required capabilities
  let candidates = models.filter(m => {
    if (requiredCapabilities.length === 0) return true;
    return requiredCapabilities.every(cap => m.capabilities.includes(cap));
  });
  
  // Apply price filter if set
  if (maxPriceInput !== null) {
    candidates = candidates.filter(m => m.pricing_input <= maxPriceInput);
  }
  
  // Sort by price (cheapest first), then by context length (larger is better)
  candidates.sort((a, b) => {
    const priceA = a.pricing_input + a.pricing_output;
    const priceB = b.pricing_input + b.pricing_output;
    if (priceA !== priceB) return priceA - priceB;
    return b.context_length - a.context_length;
  });
  
  // Exclude very cheap/free models that might be unreliable
  const reliableCandidates = candidates.filter(m => 
    m.pricing_input > 0.001 || // Not completely free
    m.id.includes('gemini') || 
    m.id.includes('deepseek') ||
    m.id.includes('qwen')
  );
  
  const primary = reliableCandidates[0]?.id || candidates[0]?.id || null;
  const fallback = reliableCandidates[1]?.id || candidates[1]?.id || null;
  
  return { primary, fallback };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!OPENROUTER_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'check';

    // Fetch current models from OpenRouter
    console.log('Fetching models from OpenRouter...');
    const modelsResponse = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
    });

    if (!modelsResponse.ok) {
      throw new Error(`OpenRouter API error: ${modelsResponse.status}`);
    }

    const modelsData = await modelsResponse.json();
    const models: OpenRouterModel[] = modelsData.data || [];
    console.log(`Fetched ${models.length} models from OpenRouter`);

    // Update model cache
    const cacheUpdates = models.map(model => ({
      id: model.id,
      name: model.name,
      pricing_input: parseFloat(model.pricing.prompt) * 1000000, // Convert to per million
      pricing_output: parseFloat(model.pricing.completion) * 1000000,
      context_length: model.context_length,
      capabilities: detectCapabilities(model),
      is_free: parseFloat(model.pricing.prompt) === 0,
      last_updated_at: new Date().toISOString(),
    }));

    // Upsert cache in batches
    const batchSize = 100;
    for (let i = 0; i < cacheUpdates.length; i += batchSize) {
      const batch = cacheUpdates.slice(i, i + batchSize);
      const { error } = await supabase
        .from('ai_model_cache')
        .upsert(batch, { onConflict: 'id' });
      
      if (error) {
        console.error('Error updating cache batch:', error);
      }
    }
    console.log('Model cache updated');

    // Get current task configurations
    const { data: taskConfigs, error: configError } = await supabase
      .from('ai_model_config')
      .select('*')
      .eq('auto_update', true);

    if (configError) {
      throw new Error(`Error fetching configs: ${configError.message}`);
    }

    // Get cached models for optimization
    const { data: cachedModels, error: cacheError } = await supabase
      .from('ai_model_cache')
      .select('id, pricing_input, pricing_output, capabilities, context_length')
      .order('pricing_input', { ascending: true });

    if (cacheError) {
      throw new Error(`Error fetching cache: ${cacheError.message}`);
    }

    const recommendations: Array<{
      task_type: string;
      current_primary: string;
      recommended_primary: string | null;
      recommended_fallback: string | null;
      price_savings: string;
      updated: boolean;
    }> = [];

    // Analyze and update each task
    for (const config of taskConfigs || []) {
      const { primary, fallback } = findBestModel(
        cachedModels || [],
        config.required_capabilities || [],
        config.max_price_per_million_input
      );

      const needsUpdate = primary && primary !== config.primary_model;
      
      // Calculate potential savings
      const currentModel = cachedModels?.find(m => m.id === config.primary_model);
      const newModel = cachedModels?.find(m => m.id === primary);
      const savings = currentModel && newModel
        ? ((currentModel.pricing_input - newModel.pricing_input) / currentModel.pricing_input * 100).toFixed(1)
        : '0';

      recommendations.push({
        task_type: config.task_type,
        current_primary: config.primary_model,
        recommended_primary: primary,
        recommended_fallback: fallback,
        price_savings: `${savings}%`,
        updated: false,
      });

      // Auto-update if action is 'optimize'
      if (action === 'optimize' && needsUpdate && primary) {
        const { error: updateError } = await supabase
          .from('ai_model_config')
          .update({
            primary_model: primary,
            fallback_model: fallback,
            last_checked_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
          })
          .eq('task_type', config.task_type);

        if (!updateError) {
          recommendations[recommendations.length - 1].updated = true;
        }
      } else {
        // Just update last_checked timestamp
        await supabase
          .from('ai_model_config')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('task_type', config.task_type);
      }
    }

    // Get top 10 cheapest vision models for reference
    const topVisionModels = cachedModels
      ?.filter(m => m.capabilities.includes('vision'))
      .slice(0, 10)
      .map(m => ({
        id: m.id,
        price_input: `$${m.pricing_input.toFixed(4)}/M`,
        price_output: `$${m.pricing_output.toFixed(4)}/M`,
      }));

    return new Response(
      JSON.stringify({
        success: true,
        action,
        models_cached: cacheUpdates.length,
        recommendations,
        top_vision_models: topVisionModels,
        message: action === 'optimize' 
          ? 'Model configurations optimized based on current pricing'
          : 'Analysis complete. Use ?action=optimize to apply changes',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ai-model-optimizer:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
