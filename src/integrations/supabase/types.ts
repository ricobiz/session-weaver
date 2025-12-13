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
      scenarios: {
        Row: {
          created_at: string
          description: string | null
          estimated_duration_seconds: number | null
          id: string
          last_run_at: string | null
          name: string
          run_count: number | null
          steps: Json
          success_rate: number | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_duration_seconds?: number | null
          id?: string
          last_run_at?: string | null
          name: string
          run_count?: number | null
          steps?: Json
          success_rate?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_duration_seconds?: number | null
          id?: string
          last_run_at?: string | null
          name?: string
          run_count?: number | null
          steps?: Json
          success_rate?: number | null
          tags?: string[] | null
          updated_at?: string
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
          completed_at: string | null
          created_at: string
          current_step: number | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          metadata: Json | null
          profile_id: string | null
          progress: number | null
          runner_id: string | null
          scenario_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          total_steps: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          metadata?: Json | null
          profile_id?: string | null
          progress?: number | null
          runner_id?: string | null
          scenario_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          total_steps?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          metadata?: Json | null
          profile_id?: string | null
          progress?: number | null
          runner_id?: string | null
          scenario_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
