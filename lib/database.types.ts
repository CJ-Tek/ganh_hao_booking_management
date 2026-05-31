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
  }
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
      area_floor_layout_by_date: {
        Row: {
          area_id: string
          floor_grid_columns: number
          floor_grid_rows: number
          floor_node_spacing: number
          id: string
          layout_date: string
          merge_group_id: string | null
          source_template_id: string | null
          table_positions: Json
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          area_id: string
          floor_grid_columns?: number
          floor_grid_rows?: number
          floor_node_spacing?: number
          id?: string
          layout_date: string
          merge_group_id?: string | null
          source_template_id?: string | null
          table_positions?: Json
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          area_id?: string
          floor_grid_columns?: number
          floor_grid_rows?: number
          floor_node_spacing?: number
          id?: string
          layout_date?: string
          merge_group_id?: string | null
          source_template_id?: string | null
          table_positions?: Json
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "area_floor_layout_by_date_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_floor_layout_by_date_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "floor_layout_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_floor_layout_by_date_merge_group_id_fkey"
            columns: ["merge_group_id"]
            isOneToOne: false
            referencedRelation: "table_merge_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_floor_layout_by_date_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          branch_id: string
          floor_grid_columns: number
          floor_grid_rows: number
          floor_node_spacing: number
          id: string
          name: string
        }
        Insert: {
          branch_id: string
          floor_grid_columns?: number
          floor_grid_rows?: number
          floor_node_spacing?: number
          id?: string
          name: string
        }
        Update: {
          branch_id?: string
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
      booking_runtime_settings: {
        Row: {
          group_party_guest_threshold: number
          id: boolean
          no_show_grace_minutes: number
          reception_arrival_grace_minutes: number
          repeat_customer_min_completed: number
          standard_turnaround_minutes: number
          updated_at: string
        }
        Insert: {
          group_party_guest_threshold?: number
          id?: boolean
          no_show_grace_minutes?: number
          reception_arrival_grace_minutes?: number
          repeat_customer_min_completed?: number
          standard_turnaround_minutes?: number
          updated_at?: string
        }
        Update: {
          group_party_guest_threshold?: number
          id?: boolean
          no_show_grace_minutes?: number
          reception_arrival_grace_minutes?: number
          repeat_customer_min_completed?: number
          standard_turnaround_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          area_id: string | null
          booking_at: string
          branch_id: string
          checked_in_at: string | null
          created_by_user_id: string
          customer_id: string
          end_time: string
          guest_count: number
          id: string
          last_edited_at: string | null
          last_edited_by_user_id: string | null
          merge_group_id: string | null
          no_show_marked_at: string | null
          note: string | null
          start_time: string
          status: string
          table_id: string | null
        }
        Insert: {
          area_id?: string | null
          booking_at: string
          branch_id: string
          checked_in_at?: string | null
          created_by_user_id: string
          customer_id: string
          end_time: string
          guest_count?: number
          id?: string
          last_edited_at?: string | null
          last_edited_by_user_id?: string | null
          merge_group_id?: string | null
          no_show_marked_at?: string | null
          note?: string | null
          start_time: string
          status?: string
          table_id?: string | null
        }
        Update: {
          area_id?: string | null
          booking_at?: string
          branch_id?: string
          checked_in_at?: string | null
          created_by_user_id?: string
          customer_id?: string
          end_time?: string
          guest_count?: number
          id?: string
          last_edited_at?: string | null
          last_edited_by_user_id?: string | null
          merge_group_id?: string | null
          no_show_marked_at?: string | null
          note?: string | null
          start_time?: string
          status?: string
          table_id?: string | null
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
            foreignKeyName: "bookings_last_edited_by_user_id_fkey"
            columns: ["last_edited_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_merge_group_id_fkey"
            columns: ["merge_group_id"]
            isOneToOne: false
            referencedRelation: "table_merge_groups"
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
          phone: string | null
        }
        Insert: {
          full_name: string
          id?: string
          note?: string | null
          phone?: string | null
        }
        Update: {
          full_name?: string
          id?: string
          note?: string | null
          phone?: string | null
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
      table_merge_groups: {
        Row: {
          area_id: string
          auto_number: number | null
          branch_id: string
          created_at: string
          created_by_user_id: string | null
          end_date: string
          id: string
          merged_name: string
          released_at: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          area_id: string
          auto_number?: number | null
          branch_id: string
          created_at?: string
          created_by_user_id?: string | null
          end_date: string
          id?: string
          merged_name: string
          released_at?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          area_id?: string
          auto_number?: number | null
          branch_id?: string
          created_at?: string
          created_by_user_id?: string | null
          end_date?: string
          id?: string
          merged_name?: string
          released_at?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_merge_groups_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_merge_groups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_merge_groups_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      table_merge_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          order_index: number
          table_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          order_index?: number
          table_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          order_index?: number
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_merge_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "table_merge_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_merge_members_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
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
          split_clone_number: number | null
          split_end_date: string | null
          split_source_table_id: string | null
          split_start_date: string | null
          status: string
        }
        Insert: {
          area_id: string
          branch_id: string
          id?: string
          name: string
          position_x?: number
          position_y?: number
          split_clone_number?: number | null
          split_end_date?: string | null
          split_source_table_id?: string | null
          split_start_date?: string | null
          status: string
        }
        Update: {
          area_id?: string
          branch_id?: string
          id?: string
          name?: string
          position_x?: number
          position_y?: number
          split_clone_number?: number | null
          split_end_date?: string | null
          split_source_table_id?: string | null
          split_start_date?: string | null
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
      assign_or_queue_pending_booking: {
        Args: {
          p_area_id: string
          p_booking_id: string
          p_end_time: string
          p_guest_count: number
          p_merge_group_id?: string
          p_start_time: string
          p_table_id: string
        }
        Returns: {
          booking_id: string
          end_time: string
          message: string
          outcome: string
          start_time: string
          waitlist_id: string
        }[]
      }
      create_or_queue_booking: {
        Args: {
          p_area_id: string
          p_branch_id: string
          p_created_by_user_id: string
          p_customer_id: string
          p_end_time: string
          p_guest_count: number
          p_merge_group_id?: string
          p_note: string
          p_start_time: string
          p_table_id: string
        }
        Returns: {
          booking_id: string
          end_time: string
          message: string
          outcome: string
          start_time: string
          waitlist_id: string
        }[]
      }
      find_booking_duplicates_by_phone_slot: {
        Args: { p_booking_at: string; p_branch_id: string; p_phone: string }
        Returns: {
          booking_at: string
          booking_id: string
          guest_count: number
          receiver_full_name: string
          receiver_user_id: string
        }[]
      }
      normalize_vietnam_phone: { Args: { raw: string }; Returns: string }
      run_booking_maintenance: {
        Args: never
        Returns: {
          expired_offer_count: number
          no_show_count: number
          promoted_count: number
        }[]
      }
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
