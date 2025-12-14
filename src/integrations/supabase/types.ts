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
      profiles: {
        Row: {
          auth_checked_at: string | null
          auth_state: string | null
          created_at: string
          email: string
          id: string
          last_active: string | null
          metadata: Json | null
          name: string
          network_config: Json | null
          password_hash: string | null
          session_context: Json | null
          sessions_run: number | null
          storage_state: Json | null
          updated_at: string
        }
        Insert: {
          auth_checked_at?: string | null
          auth_state?: string | null
          created_at?: string
          email: string
          id?: string
          last_active?: string | null
          metadata?: Json | null
          name: string
          network_config?: Json | null
          password_hash?: string | null
          session_context?: Json | null
          sessions_run?: number | null
          storage_state?: Json | null
          updated_at?: string
        }
        Update: {
          auth_checked_at?: string | null
          auth_state?: string | null
          created_at?: string
          email?: string
          id?: string
          last_active?: string | null
          metadata?: Json | null
          name?: string
          network_config?: Json | null
          password_hash?: string | null
          session_context?: Json | null
          sessions_run?: number | null
          storage_state?: Json | null
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
          resume_metadata: Json | null
          retry_count: number | null
          runner_id: string | null
          scenario_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          task_id: string | null
          total_steps: number | null
          updated_at: string
        }
        Insert: {
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
          resume_metadata?: Json | null
          retry_count?: number | null
          runner_id?: string | null
          scenario_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          task_id?: string | null
          total_steps?: number | null
          updated_at?: string
        }
        Update: {
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
          resume_metadata?: Json | null
          retry_count?: number | null
          runner_id?: string | null
          scenario_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          task_id?: string | null
          total_steps?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_profile_sessions: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: {
      log_level: "debug" | "info" | "warning" | "error" | "success"
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
