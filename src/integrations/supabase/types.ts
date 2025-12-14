export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      action_verifications: {
        Row: {
          action_index: number
          action_type: string
          after_state: Json | null
          before_state: Json | null
          confidence: number | null
          created_at: string
          evidence: Json
          id: string
          session_id: string
          verification_type: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          action_index: number
          action_type: string
          after_state?: Json | null
          before_state?: Json | null
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          session_id: string
          verification_type: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          action_index?: number
          action_type?: string
          after_state?: Json | null
          before_state?: Json | null
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          session_id?: string
          verification_type?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_verifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_cache: {
        Row: {
          capabilities: string[] | null
          context_length: number | null
          id: string
          is_free: boolean | null
          last_updated_at: string | null
          name: string | null
          pricing_input: number | null
          pricing_output: number | null
        }
        Insert: {
          capabilities?: string[] | null
          context_length?: number | null
          id: string
          is_free?: boolean | null
          last_updated_at?: string | null
          name?: string | null
          pricing_input?: number | null
          pricing_output?: number | null
        }
        Update: {
          capabilities?: string[] | null
          context_length?: number | null
          id?: string
          is_free?: boolean | null
          last_updated_at?: string | null
          name?: string | null
          pricing_input?: number | null
          pricing_output?: number | null
        }
        Relationships: []
      }
      ai_model_config: {
        Row: {
          auto_update: boolean | null
          created_at: string | null
          fallback_model: string | null
          id: string
          last_checked_at: string | null
          last_updated_at: string | null
          max_price_per_million_input: number | null
          max_price_per_million_output: number | null
          notes: string | null
          primary_model: string
          required_capabilities: string[] | null
          task_type: string
        }
        Insert: {
          auto_update?: boolean | null
          created_at?: string | null
          fallback_model?: string | null
          id?: string
          last_checked_at?: string | null
          last_updated_at?: string | null
          max_price_per_million_input?: number | null
          max_price_per_million_output?: number | null
          notes?: string | null
          primary_model: string
          required_capabilities?: string[] | null
          task_type: string
        }
        Update: {
          auto_update?: boolean | null
          created_at?: string | null
          fallback_model?: string | null
          id?: string
          last_checked_at?: string | null
          last_updated_at?: string | null
          max_price_per_million_input?: number | null
          max_price_per_million_output?: number | null
          notes?: string | null
          primary_model?: string
          required_capabilities?: string[] | null
          task_type?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          cost_usd: number | null
          created_at: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_used: string
          output_tokens: number | null
          provider: string
          session_id: string | null
          task_type: string
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_used: string
          output_tokens?: number | null
          provider: string
          session_id?: string | null
          task_type: string
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_used?: string
          output_tokens?: number | null
          provider?: string
          session_id?: string | null
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_bots: {
        Row: {
          avg_execution_time_ms: number | null
          created_at: string
          created_by_task_id: string | null
          description: string | null
          execution_count: number | null
          failure_count: number | null
          id: string
          is_active: boolean | null
          name: string
          scenario_json: Json
          success_count: number | null
          target_platform: string
          updated_at: string
        }
        Insert: {
          avg_execution_time_ms?: number | null
          created_at?: string
          created_by_task_id?: string | null
          description?: string | null
          execution_count?: number | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          scenario_json?: Json
          success_count?: number | null
          target_platform: string
          updated_at?: string
        }
        Update: {
          avg_execution_time_ms?: number | null
          created_at?: string
          created_by_task_id?: string | null
          description?: string | null
          execution_count?: number | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          scenario_json?: Json
          success_count?: number | null
          target_platform?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_bots_created_by_task_id_fkey"
            columns: ["created_by_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_queue: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          priority: number | null
          scheduled_at: string | null
          session_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          priority?: number | null
          scheduled_at?: string | null
          session_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          priority?: number | null
          scheduled_at?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_queue_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      model_config: {
        Row: {
          cost_per_1k_tokens: number | null
          created_at: string
          custom_endpoint: string | null
          fallback_model: string | null
          id: string
          is_active: boolean | null
          max_tokens: number | null
          model_name: string
          provider: string
          task_type: string
          temperature: number | null
          updated_at: string
        }
        Insert: {
          cost_per_1k_tokens?: number | null
          created_at?: string
          custom_endpoint?: string | null
          fallback_model?: string | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          model_name: string
          provider: string
          task_type: string
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          cost_per_1k_tokens?: number | null
          created_at?: string
          custom_endpoint?: string | null
          fallback_model?: string | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          model_name?: string
          provider?: string
          task_type?: string
          temperature?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profile_proxy_bindings: {
        Row: {
          bound_at: string
          id: string
          is_sticky: boolean | null
          last_used_at: string | null
          profile_id: string
          proxy_id: string
          session_count: number | null
        }
        Insert: {
          bound_at?: string
          id?: string
          is_sticky?: boolean | null
          last_used_at?: string | null
          profile_id: string
          proxy_id: string
          session_count?: number | null
        }
        Update: {
          bound_at?: string
          id?: string
          is_sticky?: boolean | null
          last_used_at?: string | null
          profile_id?: string
          proxy_id?: string
          session_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_proxy_bindings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_proxy_bindings_proxy_id_fkey"
            columns: ["proxy_id"]
            isOneToOne: false
            referencedRelation: "proxies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_checked_at: string | null
          auth_state: string | null
          auto_select_proxy: boolean | null
          created_at: string
          email: string
          fingerprint: Json | null
          id: string
          last_active: string | null
          metadata: Json | null
          name: string
          network_config: Json | null
          password_hash: string | null
          preferred_country: string | null
          preferred_proxy_type: Database["public"]["Enums"]["proxy_type"] | null
          proxy_url: string | null
          session_context: Json | null
          sessions_run: number | null
          storage_state: Json | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth_checked_at?: string | null
          auth_state?: string | null
          auto_select_proxy?: boolean | null
          created_at?: string
          email: string
          fingerprint?: Json | null
          id?: string
          last_active?: string | null
          metadata?: Json | null
          name: string
          network_config?: Json | null
          password_hash?: string | null
          preferred_country?: string | null
          preferred_proxy_type?:
            | Database["public"]["Enums"]["proxy_type"]
            | null
          proxy_url?: string | null
          session_context?: Json | null
          sessions_run?: number | null
          storage_state?: Json | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth_checked_at?: string | null
          auth_state?: string | null
          auto_select_proxy?: boolean | null
          created_at?: string
          email?: string
          fingerprint?: Json | null
          id?: string
          last_active?: string | null
          metadata?: Json | null
          name?: string
          network_config?: Json | null
          password_hash?: string | null
          preferred_country?: string | null
          preferred_proxy_type?:
            | Database["public"]["Enums"]["proxy_type"]
            | null
          proxy_url?: string | null
          session_context?: Json | null
          sessions_run?: number | null
          storage_state?: Json | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      proxies: {
        Row: {
          avg_response_ms: number | null
          bandwidth_limit_mb: number | null
          bandwidth_used_mb: number | null
          city: string | null
          country: string | null
          created_at: string
          expires_at: string | null
          failure_count: number | null
          host: string
          id: string
          last_check_at: string | null
          last_success_at: string | null
          metadata: Json | null
          name: string
          password: string | null
          port: number
          provider: Database["public"]["Enums"]["proxy_provider"]
          proxy_type: Database["public"]["Enums"]["proxy_type"]
          status: Database["public"]["Enums"]["proxy_status"]
          success_count: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avg_response_ms?: number | null
          bandwidth_limit_mb?: number | null
          bandwidth_used_mb?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          expires_at?: string | null
          failure_count?: number | null
          host: string
          id?: string
          last_check_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          name: string
          password?: string | null
          port: number
          provider?: Database["public"]["Enums"]["proxy_provider"]
          proxy_type?: Database["public"]["Enums"]["proxy_type"]
          status?: Database["public"]["Enums"]["proxy_status"]
          success_count?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avg_response_ms?: number | null
          bandwidth_limit_mb?: number | null
          bandwidth_used_mb?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          expires_at?: string | null
          failure_count?: number | null
          host?: string
          id?: string
          last_check_at?: string | null
          last_success_at?: string | null
          metadata?: Json | null
          name?: string
          password?: string | null
          port?: number
          provider?: Database["public"]["Enums"]["proxy_provider"]
          proxy_type?: Database["public"]["Enums"]["proxy_type"]
          status?: Database["public"]["Enums"]["proxy_status"]
          success_count?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      proxy_providers: {
        Row: {
          api_endpoint: string | null
          api_key_encrypted: string | null
          auto_rotate: boolean | null
          created_at: string
          id: string
          is_enabled: boolean | null
          last_sync_at: string | null
          max_concurrent: number | null
          provider: Database["public"]["Enums"]["proxy_provider"]
          rotation_interval_minutes: number | null
          settings: Json | null
          updated_at: string
        }
        Insert: {
          api_endpoint?: string | null
          api_key_encrypted?: string | null
          auto_rotate?: boolean | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          max_concurrent?: number | null
          provider: Database["public"]["Enums"]["proxy_provider"]
          rotation_interval_minutes?: number | null
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          api_endpoint?: string | null
          api_key_encrypted?: string | null
          auto_rotate?: boolean | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          max_concurrent?: number | null
          provider?: Database["public"]["Enums"]["proxy_provider"]
          rotation_interval_minutes?: number | null
          settings?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      railway_config: {
        Row: {
          created_at: string
          environment_id: string | null
          id: string
          project_id: string
          runner_url: string | null
          service_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment_id?: string | null
          id?: string
          project_id: string
          runner_url?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment_id?: string | null
          id?: string
          project_id?: string
          runner_url?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      runner_health: {
        Row: {
          active_sessions: number | null
          id: string
          last_heartbeat: string
          metadata: Json | null
          runner_id: string
          started_at: string
          total_failures: number | null
          total_sessions_executed: number | null
          uptime_seconds: number | null
        }
        Insert: {
          active_sessions?: number | null
          id?: string
          last_heartbeat?: string
          metadata?: Json | null
          runner_id: string
          started_at?: string
          total_failures?: number | null
          total_sessions_executed?: number | null
          uptime_seconds?: number | null
        }
        Update: {
          active_sessions?: number | null
          id?: string
          last_heartbeat?: string
          metadata?: Json | null
          runner_id?: string
          started_at?: string
          total_failures?: number | null
          total_sessions_executed?: number | null
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          avg_duration_ms: number | null
          created_at: string
          description: string | null
          estimated_duration_seconds: number | null
          id: string
          is_valid: boolean | null
          last_run_at: string | null
          name: string
          run_count: number | null
          steps: Json
          success_rate: number | null
          tags: string[] | null
          updated_at: string
          validation_errors: Json | null
        }
        Insert: {
          avg_duration_ms?: number | null
          created_at?: string
          description?: string | null
          estimated_duration_seconds?: number | null
          id?: string
          is_valid?: boolean | null
          last_run_at?: string | null
          name: string
          run_count?: number | null
          steps?: Json
          success_rate?: number | null
          tags?: string[] | null
          updated_at?: string
          validation_errors?: Json | null
        }
        Update: {
          avg_duration_ms?: number | null
          created_at?: string
          description?: string | null
          estimated_duration_seconds?: number | null
          id?: string
          is_valid?: boolean | null
          last_run_at?: string | null
          name?: string
          run_count?: number | null
          steps?: Json
          success_rate?: number | null
          tags?: string[] | null
          updated_at?: string
          validation_errors?: Json | null
        }
        Relationships: []
      }
      scheduler_config: {
        Row: {
          active: boolean | null
          id: string
          max_concurrency: number | null
          max_delay_ms: number | null
          max_retries: number | null
          min_delay_ms: number | null
          randomize_delays: boolean | null
          retry_on_failure: boolean | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          id?: string
          max_concurrency?: number | null
          max_delay_ms?: number | null
          max_retries?: number | null
          min_delay_ms?: number | null
          randomize_delays?: boolean | null
          retry_on_failure?: boolean | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          id?: string
          max_concurrency?: number | null
          max_delay_ms?: number | null
          max_retries?: number | null
          min_delay_ms?: number | null
          randomize_delays?: boolean | null
          retry_on_failure?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      session_logs: {
        Row: {
          action: string | null
          details: Json | null
          duration_ms: number | null
          id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          session_id: string
          step_index: number | null
          timestamp: string
        }
        Insert: {
          action?: string | null
          details?: Json | null
          duration_ms?: number | null
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message: string
          session_id: string
          step_index?: number | null
          timestamp?: string
        }
        Update: {
          action?: string | null
          details?: Json | null
          duration_ms?: number | null
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          session_id?: string
          step_index?: number | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          automation_bot_id: string | null
          captcha_detected_at: string | null
          captcha_resolved_at: string | null
          captcha_status: string | null
          completed_at: string | null
          created_at: string
          current_step: number | null
          current_url: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          is_resumable: boolean | null
          last_screenshot_url: string | null
          last_successful_step: number | null
          max_retries: number | null
          metadata: Json | null
          profile_id: string | null
          profile_state: string | null
          progress: number | null
          proxy_id: string | null
          resume_metadata: Json | null
          retry_count: number | null
          runner_id: string | null
          scenario_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          task_id: string | null
          total_steps: number | null
          updated_at: string
          verification_score: number | null
        }
        Insert: {
          automation_bot_id?: string | null
          captcha_detected_at?: string | null
          captcha_resolved_at?: string | null
          captcha_status?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: number | null
          current_url?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          is_resumable?: boolean | null
          last_screenshot_url?: string | null
          last_successful_step?: number | null
          max_retries?: number | null
          metadata?: Json | null
          profile_id?: string | null
          profile_state?: string | null
          progress?: number | null
          proxy_id?: string | null
          resume_metadata?: Json | null
          retry_count?: number | null
          runner_id?: string | null
          scenario_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          task_id?: string | null
          total_steps?: number | null
          updated_at?: string
          verification_score?: number | null
        }
        Update: {
          automation_bot_id?: string | null
          captcha_detected_at?: string | null
          captcha_resolved_at?: string | null
          captcha_status?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: number | null
          current_url?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          is_resumable?: boolean | null
          last_screenshot_url?: string | null
          last_successful_step?: number | null
          max_retries?: number | null
          metadata?: Json | null
          profile_id?: string | null
          profile_state?: string | null
          progress?: number | null
          proxy_id?: string | null
          resume_metadata?: Json | null
          retry_count?: number | null
          runner_id?: string | null
          scenario_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          task_id?: string | null
          total_steps?: number | null
          updated_at?: string
          verification_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_automation_bot_id_fkey"
            columns: ["automation_bot_id"]
            isOneToOne: false
            referencedRelation: "automation_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_proxy_id_fkey"
            columns: ["proxy_id"]
            isOneToOne: false
            referencedRelation: "proxies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      system_diagnostics: {
        Row: {
          check_type: string
          checked_at: string
          component: string
          details: Json | null
          id: string
          message: string | null
          response_time_ms: number | null
          status: string
        }
        Insert: {
          check_type: string
          checked_at?: string
          component: string
          details?: Json | null
          id?: string
          message?: string | null
          response_time_ms?: number | null
          status: string
        }
        Update: {
          check_type?: string
          checked_at?: string
          component?: string
          details?: Json | null
          id?: string
          message?: string | null
          response_time_ms?: number | null
          status?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          behavior_config: Json
          completed_at: string | null
          created_at: string
          description: string | null
          entry_method: string
          generated_scenario_id: string | null
          goal_type: string
          id: string
          name: string
          profile_ids: string[] | null
          run_count: number | null
          search_query: string | null
          sessions_completed: number | null
          sessions_created: number | null
          sessions_failed: number | null
          started_at: string | null
          status: string
          target_platform: string
          target_url: string | null
          updated_at: string
        }
        Insert: {
          behavior_config?: Json
          completed_at?: string | null
          created_at?: string
          description?: string | null
          entry_method?: string
          generated_scenario_id?: string | null
          goal_type?: string
          id?: string
          name: string
          profile_ids?: string[] | null
          run_count?: number | null
          search_query?: string | null
          sessions_completed?: number | null
          sessions_created?: number | null
          sessions_failed?: number | null
          started_at?: string | null
          status?: string
          target_platform: string
          target_url?: string | null
          updated_at?: string
        }
        Update: {
          behavior_config?: Json
          completed_at?: string | null
          created_at?: string
          description?: string | null
          entry_method?: string
          generated_scenario_id?: string | null
          goal_type?: string
          id?: string
          name?: string
          profile_ids?: string[] | null
          run_count?: number | null
          search_query?: string | null
          sessions_completed?: number | null
          sessions_created?: number | null
          sessions_failed?: number | null
          started_at?: string | null
          status?: string
          target_platform?: string
          target_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_generated_scenario_id_fkey"
            columns: ["generated_scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bots: {
        Row: {
          automation_bot_id: string | null
          bot_token_encrypted: string | null
          created_at: string
          id: string
          name: string
          status: string | null
          updated_at: string
          username: string | null
          webhook_url: string | null
        }
        Insert: {
          automation_bot_id?: string | null
          bot_token_encrypted?: string | null
          created_at?: string
          id?: string
          name: string
          status?: string | null
          updated_at?: string
          username?: string | null
          webhook_url?: string | null
        }
        Update: {
          automation_bot_id?: string | null
          bot_token_encrypted?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: string | null
          updated_at?: string
          username?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_bots_automation_bot_id_fkey"
            columns: ["automation_bot_id"]
            isOneToOne: false
            referencedRelation: "automation_bots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_select_proxy: {
        Args: {
          p_preferred_country?: string
          p_preferred_type?: Database["public"]["Enums"]["proxy_type"]
          p_profile_id: string
        }
        Returns: string
      }
      increment_profile_sessions: { Args: { p_id: string }; Returns: undefined }
      run_system_diagnostic: {
        Args: {
          p_check_type: string
          p_component: string
          p_details?: Json
          p_message?: string
          p_response_time_ms?: number
          p_status: string
        }
        Returns: string
      }
    }
    Enums: {
      log_level: "debug" | "info" | "warning" | "error" | "success"
      proxy_provider:
        | "manual"
        | "bright_data"
        | "oxylabs"
        | "smartproxy"
        | "iproyal"
        | "webshare"
      proxy_status: "active" | "inactive" | "testing" | "failed" | "expired"
      proxy_type:
        | "http"
        | "https"
        | "socks4"
        | "socks5"
        | "residential"
        | "datacenter"
        | "mobile"
      session_status:
        | "idle"
        | "queued"
        | "running"
        | "paused"
        | "success"
        | "error"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      log_level: ["debug", "info", "warning", "error", "success"],
      proxy_provider: [
        "manual",
        "bright_data",
        "oxylabs",
        "smartproxy",
        "iproyal",
        "webshare",
      ],
      proxy_status: ["active", "inactive", "testing", "failed", "expired"],
      proxy_type: [
        "http",
        "https",
        "socks4",
        "socks5",
        "residential",
        "datacenter",
        "mobile",
      ],
      session_status: [
        "idle",
        "queued",
        "running",
        "paused",
        "success",
        "error",
        "cancelled",
      ],
    },
  },
} as const
