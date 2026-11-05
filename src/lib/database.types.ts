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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          default_shelf_life_days: number | null
          default_zone_type: string
          household_id: string
          icon: string
          id: string
          name: string
          opened_shelf_life_days: number | null
          sort: number
        }
        Insert: {
          default_shelf_life_days?: number | null
          default_zone_type?: string
          household_id: string
          icon?: string
          id?: string
          name: string
          opened_shelf_life_days?: number | null
          sort?: number
        }
        Update: {
          default_shelf_life_days?: number | null
          default_zone_type?: string
          household_id?: string
          icon?: string
          id?: string
          name?: string
          opened_shelf_life_days?: number | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          household_id: string
          id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          household_id: string
          id?: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          household_id?: string
          id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          color: string
          display_name: string
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          color?: string
          display_name: string
          household_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          color?: string
          display_name?: string
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          col: number
          col_span: number
          household_id: string
          id: string
          label: string
          row: number
          row_span: number
          zone_id: string
        }
        Insert: {
          col: number
          col_span?: number
          household_id: string
          id?: string
          label: string
          row: number
          row_span?: number
          zone_id: string
        }
        Update: {
          col?: number
          col_span?: number
          household_id?: string
          id?: string
          label?: string
          row?: number
          row_span?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_zone_id_household_id_fkey"
            columns: ["zone_id", "household_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      products: {
        Row: {
          archived: boolean
          barcode: string | null
          category_id: string | null
          created_at: string
          default_location_id: string | null
          default_qty: number
          default_unit: string
          household_id: string
          id: string
          image_url: string | null
          is_quick_add: boolean
          name: string
          opened_shelf_life_days: number | null
          price: number | null
          shelf_life_days: number | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          default_location_id?: string | null
          default_qty?: number
          default_unit?: string
          household_id: string
          id?: string
          image_url?: string | null
          is_quick_add?: boolean
          name: string
          opened_shelf_life_days?: number | null
          price?: number | null
          shelf_life_days?: number | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          default_location_id?: string | null
          default_qty?: number
          default_unit?: string
          household_id?: string
          id?: string
          image_url?: string | null
          is_quick_add?: boolean
          name?: string
          opened_shelf_life_days?: number | null
          price?: number | null
          shelf_life_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_household_id_fkey"
            columns: ["category_id", "household_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "products_default_location_id_household_id_fkey"
            columns: ["default_location_id", "household_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "products_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          ai_enabled: boolean
          ai_model: string
          ai_monthly_limit_czk: number
          ai_price_input_per_mtok: number | null
          ai_price_output_per_mtok: number | null
          display_fields: Json
          expiry_warn_days: number
          household_id: string
          notify_time: string
          timezone: string
          updated_at: string
          zivyobraz_enabled: boolean
        }
        Insert: {
          ai_enabled?: boolean
          ai_model?: string
          ai_monthly_limit_czk?: number
          ai_price_input_per_mtok?: number | null
          ai_price_output_per_mtok?: number | null
          display_fields?: Json
          expiry_warn_days?: number
          household_id: string
          notify_time?: string
          timezone?: string
          updated_at?: string
          zivyobraz_enabled?: boolean
        }
        Update: {
          ai_enabled?: boolean
          ai_model?: string
          ai_monthly_limit_czk?: number
          ai_price_input_per_mtok?: number | null
          ai_price_output_per_mtok?: number | null
          display_fields?: Json
          expiry_warn_days?: number
          household_id?: string
          notify_time?: string
          timezone?: string
          updated_at?: string
          zivyobraz_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "settings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_events: {
        Row: {
          at: string
          by_user: string | null
          from_location_id: string | null
          household_id: string
          id: number
          note: string | null
          quantity: number | null
          stock_item_id: string
          to_location_id: string | null
          type: string
        }
        Insert: {
          at?: string
          by_user?: string | null
          from_location_id?: string | null
          household_id: string
          id?: never
          note?: string | null
          quantity?: number | null
          stock_item_id: string
          to_location_id?: string | null
          type: string
        }
        Update: {
          at?: string
          by_user?: string | null
          from_location_id?: string | null
          household_id?: string
          id?: never
          note?: string | null
          quantity?: number | null
          stock_item_id?: string
          to_location_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_events_stock_item_id_household_id_fkey"
            columns: ["stock_item_id", "household_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      stock_items: {
        Row: {
          added_by: string | null
          created_at: string
          expires_on: string | null
          expiry_source: string
          household_id: string
          id: string
          location_id: string | null
          opened_on: string | null
          product_id: string
          purchased_on: string
          quantity: number
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          expires_on?: string | null
          expiry_source?: string
          household_id: string
          id?: string
          location_id?: string | null
          opened_on?: string | null
          product_id: string
          purchased_on?: string
          quantity: number
          status?: string
          unit: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          expires_on?: string | null
          expiry_source?: string
          household_id?: string
          id?: string
          location_id?: string | null
          opened_on?: string | null
          product_id?: string
          purchased_on?: string
          quantity?: number
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_location_id_household_id_fkey"
            columns: ["location_id", "household_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "stock_items_product_id_household_id_fkey"
            columns: ["product_id", "household_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          grid_cols: number
          grid_rows: number
          household_id: string
          id: string
          name: string
          sort: number
          type: string
        }
        Insert: {
          created_at?: string
          grid_cols?: number
          grid_rows?: number
          household_id: string
          id?: string
          name: string
          sort?: number
          type?: string
        }
        Update: {
          created_at?: string
          grid_cols?: number
          grid_rows?: number
          household_id?: string
          id?: string
          name?: string
          sort?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _stock_item_for_update: {
        Args: { p_item_id: string }
        Returns: {
          added_by: string | null
          created_at: string
          expires_on: string | null
          expiry_source: string
          household_id: string
          id: string
          location_id: string | null
          opened_on: string | null
          product_id: string
          purchased_on: string
          quantity: number
          status: string
          unit: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_invite: {
        Args: { p_color?: string; p_display_name: string; p_token: string }
        Returns: string
      }
      add_stock: {
        Args: {
          p_expires_on?: string
          p_location_id?: string
          p_product_id: string
          p_purchased_on?: string
          p_quantity?: number
          p_unit?: string
        }
        Returns: string
      }
      adjust_stock: {
        Args: { p_expires_on?: string; p_item_id: string; p_quantity?: number }
        Returns: undefined
      }
      create_household: {
        Args: { p_color?: string; p_display_name: string; p_name: string }
        Returns: string
      }
      create_invite: { Args: { p_household_id: string }; Returns: string }
      get_invite: {
        Args: { p_token: string }
        Returns: {
          household_name: string
          invited_by: string
          status: string
        }[]
      }
      is_household_admin: { Args: { p_household_id: string }; Returns: boolean }
      is_household_member: {
        Args: { p_household_id: string }
        Returns: boolean
      }
      move_stock: {
        Args: { p_item_id: string; p_location_id: string }
        Returns: undefined
      }
      open_stock: { Args: { p_item_id: string }; Returns: undefined }
      seed_household_defaults: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      take_stock: {
        Args: {
          p_item_id: string
          p_kind: string
          p_note?: string
          p_quantity?: number
        }
        Returns: undefined
      }
      today_prague: { Args: never; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
