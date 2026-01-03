export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: string
          subscription_plan: string
          simulations_used: number
          simulations_limit: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: string
          subscription_plan?: string
          simulations_used?: number
          simulations_limit?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: string
          subscription_plan?: string
          simulations_used?: number
          simulations_limit?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          created_at?: string
          updated_at?: string
        }
      }
      materials: {
        Row: {
          id: string
          name: string
          category: string
          thermal_conductivity: number
          specific_heat: number
          density: number
          melting_point: number | null
          color_hex: string
          is_public: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          category: string
          thermal_conductivity: number
          specific_heat: number
          density: number
          melting_point?: number | null
          color_hex?: string
          is_public?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
          thermal_conductivity?: number
          specific_heat?: number
          density?: number
          melting_point?: number | null
          color_hex?: string
          is_public?: boolean
          created_by?: string | null
          created_at?: string
        }
      }
      simulations: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          geometry_type: string
          geometry_config: Json
          material_id: string | null
          boundary_conditions: Json
          mesh_density: string
          status: string
          progress: number
          estimated_duration: number | null
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          geometry_type: string
          geometry_config?: Json
          material_id?: string | null
          boundary_conditions?: Json
          mesh_density?: string
          status?: string
          progress?: number
          estimated_duration?: number | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          geometry_type?: string
          geometry_config?: Json
          material_id?: string | null
          boundary_conditions?: Json
          mesh_density?: string
          status?: string
          progress?: number
          estimated_duration?: number | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
      }
      simulation_results: {
        Row: {
          id: string
          simulation_id: string
          temperature_data: Json
          pressure_data: Json
          velocity_data: Json
          max_temperature: number | null
          min_temperature: number | null
          pressure_drop: number | null
          uncertainty_score: number | null
          domain_shift_alert: boolean | null
          thermal_efficiency: number | null
          convergence_metrics: Json | null
          result_files: Json | null
          visualization_config: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          simulation_id: string
          temperature_data?: Json
          pressure_data?: Json
          velocity_data?: Json
          max_temperature?: number | null
          min_temperature?: number | null
          pressure_drop?: number | null
          uncertainty_score?: number | null
          domain_shift_alert?: boolean | null
          thermal_efficiency?: number | null
          convergence_metrics?: Json | null
          result_files?: Json | null
          visualization_config?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          simulation_id?: string
          temperature_data?: Json
          pressure_data?: Json
          velocity_data?: Json
          max_temperature?: number | null
          min_temperature?: number | null
          pressure_drop?: number | null
          uncertainty_score?: number | null
          domain_shift_alert?: boolean | null
          thermal_efficiency?: number | null
          convergence_metrics?: Json | null
          result_files?: Json | null
          visualization_config?: Json | null
          created_at?: string
        }
      }
      simulation_metrics: {
        Row: {
          id: string
          simulation_id: string | null
          metric_type: string
          value: number
          timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          simulation_id?: string | null
          metric_type: string
          value: number
          timestamp?: string
          created_at?: string
        }
        Update: {
          id?: string
          simulation_id?: string | null
          metric_type?: string
          value?: number
          timestamp?: string
          created_at?: string
        }
      }
      support_tickets: {
        Row: {
          id: string
          user_id: string
          subject: string
          description: string
          category: string
          status: string
          priority: string
          assigned_to: string | null
          resolution: string | null
          created_at: string
          updated_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          subject: string
          description: string
          category: string
          status?: string
          priority?: string
          assigned_to?: string | null
          resolution?: string | null
          created_at?: string
          updated_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          subject?: string
          description?: string
          category?: string
          status?: string
          priority?: string
          assigned_to?: string | null
          resolution?: string | null
          created_at?: string
          updated_at?: string
          resolved_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_simulations_used: {
        Args: { user_uuid: string }
        Returns: undefined
      }
      reset_monthly_limits: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
