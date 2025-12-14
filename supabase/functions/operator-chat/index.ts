import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  context?: {
    activeTasks?: any[];
    activeSessions?: any[];
    systemStatus?: any;
  };
}

const SYSTEM_PROMPT = `You are an intelligent AI operator assistant for an automation system. Your role is to:

1. UNDERSTAND USER INTENT - Analyze each message to determine if the user wants:
   - A casual conversation (greetings, questions about the system, etc.)
   - A task request that needs planning and execution
   - Information about current system state
   - Modifications to running tasks

2. RESPOND APPROPRIATELY:
   - For casual conversation: respond naturally and helpfully
   - For task requests: respond with a structured plan in JSON format
   - For system queries: provide status information based on context
   - For task modifications: suggest specific changes

3. WHEN GENERATING A TASK PLAN, you MUST respond with ONLY valid JSON in this exact format:
{
  "type": "task_plan",
  "task": {
    "name": "Task name",
    "platform": "spotify|youtube|instagram|tiktok|twitter|web",
    "goal": "play|view|like|comment|follow|scroll|custom",
    "target_url": "https://...",
    "entry_method": "direct|search",
    "search_query": "optional search query",
    "profile_count": 5,
    "run_count": 1,
    "behavior": {
      "watch_duration_percent": 80,
      "like_probability": 0.5,
      "comment_probability": 0,
      "scroll_depth": 3
    }
  },
  "reasoning": "Explanation of the plan"
}

4. FOR NON-TASK RESPONSES, respond with:
{
  "type": "conversation",
  "message": "Your response here"
}

5. CONTEXT AWARENESS - You have access to:
   - Active tasks and their status
   - Running sessions and their progress
   - System health and available workers

6. ADAPTIVE BEHAVIOR:
   - If a task is failing, analyze why and suggest adjustments
   - If the platform changed, recommend updating the approach
   - If resources are limited, adjust the plan accordingly

Always be helpful, concise, and action-oriented. Speak Russian if the user speaks Russian.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, model, context } = await req.json() as ChatRequest;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context-aware system message
    let systemMessage = SYSTEM_PROMPT;
    
    if (context) {
      systemMessage += `\n\n--- CURRENT SYSTEM STATE ---\n`;
      
      if (context.activeTasks && context.activeTasks.length > 0) {
        systemMessage += `\nActive Tasks (${context.activeTasks.length}):\n`;
        context.activeTasks.forEach((task: any) => {
          systemMessage += `- "${task.name}" - ${task.status}, ${task.progress}% complete (${task.sessionsCompleted}/${task.sessionsTotal} sessions)\n`;
        });
      } else {
        systemMessage += `\nNo active tasks.\n`;
      }
      
      if (context.activeSessions && context.activeSessions.length > 0) {
        systemMessage += `\nRunning Sessions: ${context.activeSessions.length}\n`;
      }
      
      if (context.systemStatus) {
        systemMessage += `\nSystem: ${context.systemStatus.online ? 'Online' : 'Offline'}, ${context.systemStatus.workers || 0} workers available\n`;
      }
    }

    console.log("[operator-chat] Processing request with model:", model || "google/gemini-2.5-flash");
    console.log("[operator-chat] Messages count:", messages.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemMessage },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[operator-chat] AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Rate limit exceeded. Please try again later.",
          type: "error"
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "AI credits exhausted. Please add more credits.",
          type: "error"
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "";
    
    console.log("[operator-chat] AI response received, length:", aiResponse.length);

    // Try to parse the response as JSON
    let parsedResponse;
    try {
      // Extract JSON from response if wrapped in markdown
      let jsonStr = aiResponse;
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      parsedResponse = JSON.parse(jsonStr);
    } catch {
      // If not valid JSON, wrap as conversation
      parsedResponse = {
        type: "conversation",
        message: aiResponse
      };
    }

    return new Response(JSON.stringify(parsedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[operator-chat] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      type: "error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
