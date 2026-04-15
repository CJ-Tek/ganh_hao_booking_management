// Generated from Supabase (user-supabase MCP: generate_typescript_types). Regenerate after schema changes.

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
    PostgrestVersion: "14.5"
  },
  public: {
    Tables: {
      app_users: {
        Row: {
          branch_ids: string[]
          full_name: string
          id: string
          password: string
          role: string
          username: string
        }
        Insert: {
          branch_ids?: string[]
          full_name: string
          id?: string
          password: string
          role: string
          username: string
        }
        Update: {
          branch_ids?: string[]
          full_name?: string
          id?: string
          password?: string
          role?: string
          username?: string
        }
        Relationships: []
      }
      areas: {
        Row: {
          branch_id: string
          capacity: number
          floor_grid_columns: number
          floor_grid_rows: number
          floor_node_spacing: number
          id: string
          name: string
        }
        Insert: {
          branch_id: string
          capacity?: number
          floor_grid_columns?: number
          floor_grid_rows?: number
          floor_node_spacing?: number
          id?: string
          name: string
        }
        Update: {
          branch_id?: string
          capacity?: number
          floor_grid_columns?: number
          floor_grid_rows?: number
          floor_node_spacing?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          area_id: string
          booking_at: string
          branch_id: string
          created_by_user_id: string
          customer_id: string
          guest_count: number
          id: string
          note: string | null
          status: string
          table_id: string
        }
        Insert: {
          area_id: string
          booking_at: string
          branch_id: string
          created_by_user_id: string
          customer_id: string
          guest_count?: number
          id?: string
          note?: string | null
          status?: string
          table_id: string
        }
        Update: {
          area_id?: string
          booking_at?: string
          branch_id?: string
          created_by_user_id?: string
          customer_id?: string
          guest_count?: number
          id?: string
          note?: string | null
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string
          id: string
          name: string
        }
        Insert: {
          address: string
          id: string
          name: string
        }
        Update: {
          address?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          full_name: string
          id: string
          note: string | null
          phone: string
        }
        Insert: {
          full_name: string
          id?: string
          note?: string | null
          phone: string
        }
        Update: {
          full_name?: string
          id?: string
          note?: string | null
          phone?: string
        }
        Relationships: []
      }
      floor_backgrounds: {
        Row: {
          area_id: string
          id: string
          image_data_url: string
          user_id: string
        }
        Insert: {
          area_id: string
          id?: string
          image_data_url: string
          user_id: string
        }
        Update: {
          area_id?: string
          id?: string
          image_data_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_backgrounds_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_backgrounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_layout_edit_locks: {
        Row: {
          area_id: string
          expires_at: string
          user_id: string
        }
        Insert: {
          area_id: string
          expires_at: string
          user_id: string
        }
        Update: {
          area_id?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: []
      }
      floor_layout_template_selections: {
        Row: {
          area_id: string
          id: string
          template_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area_id: string
          id?: string
          template_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          area_id?: string
          id?: string
          template_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_layout_template_selections_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_layout_template_selections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_layout_templates: {
        Row: {
          area_id: string
          background_image_data_url: string | null
          background_scale: number
          created_by_user_id: string
          id: string
          name: string
          table_layout_json: Json
          updated_at: string
        }
        Insert: {
          area_id: string
          background_image_data_url?: string | null
          background_scale?: number
          created_by_user_id: string
          id?: string
          name: string
          table_layout_json?: Json
          updated_at?: string
        }
        Update: {
          area_id?: string
          background_image_data_url?: string | null
          background_scale?: number
          created_by_user_id?: string
          id?: string
          name?: string
          table_layout_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_layout_templates_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_layout_templates_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notifications: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          area_id: string
          branch_id: string
          id: string
          name: string
          position_x: number
          position_y: number
          seats: number
          status: string
        }
        Insert: {
          area_id: string
          branch_id: string
          id?: string
          name: string
          position_x?: number
          position_y?: number
          seats?: number
          status: string
        }
        Update: {
          area_id?: string
          branch_id?: string
          id?: string
          name?: string
          position_x?: number
          position_y?: number
          seats?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
