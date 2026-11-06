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
      ai_usage: {
        Row: {
          at: string
          est_cost_czk: number
          feature: string
          household_id: string
          id: number
          input_tokens: number
          model: string
          output_tokens: number
          user_id: string | null
        }
        Insert: {
          at?: string
          est_cost_czk?: number
          feature: string
          household_id: string
          id?: never
          input_tokens?: number
          model: string
          output_tokens?: number
          user_id?: string | null
        }
        Update: {
          at?: string
          est_cost_czk?: number
          feature?: string
          household_id?: string
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cook_log: {
        Row: {
          by_user: string | null
          cooked_at: string
          household_id: string
          id: string
          recipe_id: string
          servings: number | null
        }
        Insert: {
          by_user?: string | null
          cooked_at?: string
          household_id: string
          id?: string
          recipe_id: string
          servings?: number | null
        }
        Update: {
          by_user?: string | null
          cooked_at?: string
          household_id?: string
          id?: string
          recipe_id?: string
          servings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cook_log_recipe_id_household_id_fkey"
            columns: ["recipe_id", "household_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      day_entries: {
        Row: {
          date: string
          household_id: string
          id: string
          joy: string | null
          mood: number | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          date?: string
          household_id: string
          id?: string
          joy?: string | null
          mood?: number | null
          owner_id?: string
          updated_at?: string
        }
        Update: {
          date?: string
          household_id?: string
          id?: string
          joy?: string | null
          mood?: number | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      display_config: {
        Row: {
          dirty_at: string | null
          household_id: string
          import_key: string | null
          last_push_at: string | null
          last_request_id: number | null
          last_request_ids: number[]
        }
        Insert: {
          dirty_at?: string | null
          household_id: string
          import_key?: string | null
          last_push_at?: string | null
          last_request_id?: number | null
          last_request_ids?: number[]
        }
        Update: {
          dirty_at?: string | null
          household_id?: string
          import_key?: string | null
          last_push_at?: string | null
          last_request_id?: number | null
          last_request_ids?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "display_config_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      display_pins: {
        Row: {
          created_at: string
          created_on: string
          household_id: string
          id: string
          kind: string
          owner_id: string
          ref_id: string | null
          slot: number
          text: string
          until_date: string | null
          until_kind: string
        }
        Insert: {
          created_at?: string
          created_on?: string
          household_id: string
          id?: string
          kind?: string
          owner_id?: string
          ref_id?: string | null
          slot: number
          text: string
          until_date?: string | null
          until_kind?: string
        }
        Update: {
          created_at?: string
          created_on?: string
          household_id?: string
          id?: string
          kind?: string
          owner_id?: string
          ref_id?: string | null
          slot?: number
          text?: string
          until_date?: string | null
          until_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_pins_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          activity_type: string | null
          created_at: string
          date: string
          habit_id: string
          id: string
          note: string | null
          owner_id: string
        }
        Insert: {
          activity_type?: string | null
          created_at?: string
          date?: string
          habit_id: string
          id?: string
          note?: string | null
          owner_id?: string
        }
        Update: {
          activity_type?: string | null
          created_at?: string
          date?: string
          habit_id?: string
          id?: string
          note?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_owner_id_fkey"
            columns: ["habit_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      habits: {
        Row: {
          activity_types: string[]
          archived: boolean
          created_at: string
          days: number[]
          household_id: string
          icon: string
          id: string
          kind: string
          name: string
          owner_id: string
          per_week: number | null
          schedule: string
          show_on_display: boolean
          sort: number
        }
        Insert: {
          activity_types?: string[]
          archived?: boolean
          created_at?: string
          days?: number[]
          household_id: string
          icon?: string
          id?: string
          kind?: string
          name: string
          owner_id?: string
          per_week?: number | null
          schedule?: string
          show_on_display?: boolean
          sort?: number
        }
        Update: {
          activity_types?: string[]
          archived?: boolean
          created_at?: string
          days?: number[]
          household_id?: string
          icon?: string
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          per_week?: number | null
          schedule?: string
          show_on_display?: boolean
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "habits_household_id_fkey"
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
      ingredient_aliases: {
        Row: {
          alias: string
          household_id: string
          id: string
          ingredient_id: string
        }
        Insert: {
          alias: string
          household_id: string
          id?: string
          ingredient_id: string
        }
        Update: {
          alias?: string
          household_id?: string
          id?: string
          ingredient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_aliases_ingredient_id_household_id_fkey"
            columns: ["ingredient_id", "household_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      ingredients: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_staple: boolean
          name: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          is_staple?: boolean
          name: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_staple?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_chapters: {
        Row: {
          archived: boolean
          created_at: string
          household_id: string
          icon: string
          id: string
          name: string
          owner_id: string
          sort: number
          visibility: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          household_id: string
          icon?: string
          id?: string
          name: string
          owner_id?: string
          sort?: number
          visibility?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          household_id?: string
          icon?: string
          id?: string
          name?: string
          owner_id?: string
          sort?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_chapters_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          body: string
          chapter_id: string
          created_at: string
          entry_date: string
          household_id: string
          id: string
          owner_id: string
          photo_paths: string[]
          pinned: boolean
          source_ref: string | null
          source_type: string
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string
          chapter_id: string
          created_at?: string
          entry_date?: string
          household_id: string
          id?: string
          owner_id?: string
          photo_paths?: string[]
          pinned?: boolean
          source_ref?: string | null
          source_type?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          chapter_id?: string
          created_at?: string
          entry_date?: string
          household_id?: string
          id?: string
          owner_id?: string
          photo_paths?: string[]
          pinned?: boolean
          source_ref?: string | null
          source_type?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_chapter_id_household_id_fkey"
            columns: ["chapter_id", "household_id"]
            isOneToOne: false
            referencedRelation: "journal_chapters"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "journal_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
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
      off_cache: {
        Row: {
          barcode: string
          data: Json
          fetched_at: string
          found: boolean
        }
        Insert: {
          barcode: string
          data?: Json
          fetched_at?: string
          found: boolean
        }
        Update: {
          barcode?: string
          data?: Json
          fetched_at?: string
          found?: boolean
        }
        Relationships: []
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
          ingredient_id: string | null
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
          ingredient_id?: string | null
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
          ingredient_id?: string | null
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
          {
            foreignKeyName: "products_ingredient_fk"
            columns: ["ingredient_id", "household_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      recipe_categories: {
        Row: {
          household_id: string
          icon: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          household_id: string
          icon?: string
          id?: string
          name: string
          sort?: number
        }
        Update: {
          household_id?: string
          icon?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_category_links: {
        Row: {
          category_id: string
          household_id: string
          recipe_id: string
        }
        Insert: {
          category_id: string
          household_id: string
          recipe_id: string
        }
        Update: {
          category_id?: string
          household_id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_category_links_category_id_household_id_fkey"
            columns: ["category_id", "household_id"]
            isOneToOne: false
            referencedRelation: "recipe_categories"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "recipe_category_links_recipe_id_household_id_fkey"
            columns: ["recipe_id", "household_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          household_id: string
          id: string
          ingredient_id: string | null
          name: string
          note: string | null
          optional: boolean
          quantity: number | null
          recipe_id: string
          sort: number
          unit: string | null
        }
        Insert: {
          household_id: string
          id?: string
          ingredient_id?: string | null
          name: string
          note?: string | null
          optional?: boolean
          quantity?: number | null
          recipe_id: string
          sort?: number
          unit?: string | null
        }
        Update: {
          household_id?: string
          id?: string
          ingredient_id?: string | null
          name?: string
          note?: string | null
          optional?: boolean
          quantity?: number | null
          recipe_id?: string
          sort?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_household_id_fkey"
            columns: ["ingredient_id", "household_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_household_id_fkey"
            columns: ["recipe_id", "household_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          image_url: string | null
          notes: string
          photo_paths: string[]
          prep_minutes: number | null
          rating: number | null
          servings: number | null
          source_type: string
          source_url: string | null
          steps: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          image_url?: string | null
          notes?: string
          photo_paths?: string[]
          prep_minutes?: number | null
          rating?: number | null
          servings?: number | null
          source_type?: string
          source_url?: string | null
          steps?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          image_url?: string | null
          notes?: string
          photo_paths?: string[]
          prep_minutes?: number | null
          rating?: number | null
          servings?: number | null
          source_type?: string
          source_url?: string | null
          steps?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_household_id_fkey"
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
      shopping_items: {
        Row: {
          added_by: string | null
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          created_at: string
          household_id: string
          id: string
          ingredient_id: string | null
          note: string | null
          product_id: string | null
          quantity: number | null
          recipe_titles: string[]
          source: string
          text: string
          unit: string | null
        }
        Insert: {
          added_by?: string | null
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          household_id: string
          id?: string
          ingredient_id?: string | null
          note?: string | null
          product_id?: string | null
          quantity?: number | null
          recipe_titles?: string[]
          source?: string
          text: string
          unit?: string | null
        }
        Update: {
          added_by?: string | null
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          household_id?: string
          id?: string
          ingredient_id?: string | null
          note?: string | null
          product_id?: string | null
          quantity?: number | null
          recipe_titles?: string[]
          source?: string
          text?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_items_ingredient_id_household_id_fkey"
            columns: ["ingredient_id", "household_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "shopping_items_product_id_household_id_fkey"
            columns: ["product_id", "household_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "household_id"]
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
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          done_at: string | null
          done_by: string | null
          due_date: string | null
          household_id: string
          id: string
          notes: string | null
          owner_id: string
          prev_task_id: string | null
          priority: number
          recurrence: string | null
          title: string
          top3_on: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          household_id: string
          id?: string
          notes?: string | null
          owner_id?: string
          prev_task_id?: string | null
          priority?: number
          recurrence?: string | null
          title: string
          top3_on?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          household_id?: string
          id?: string
          notes?: string | null
          owner_id?: string
          prev_task_id?: string | null
          priority?: number
          recurrence?: string | null
          title?: string
          top3_on?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_household_id_assignee_id_fkey"
            columns: ["household_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["household_id", "user_id"]
          },
          {
            foreignKeyName: "tasks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_prev_task_id_fkey"
            columns: ["prev_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
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
      _display_values: { Args: { p_household_id: string }; Returns: Json }
      _push_display: { Args: { p_household_id: string }; Returns: boolean }
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
      add_shopping_items: {
        Args: { p_household_id: string; p_items: Json }
        Returns: number
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
      can_read_chapter: { Args: { p_chapter_id: string }; Returns: boolean }
      cook_recipe: {
        Args: { p_recipe_id: string; p_servings?: number; p_takes?: Json }
        Returns: string
      }
      create_household: {
        Args: { p_color?: string; p_display_name: string; p_name: string }
        Returns: string
      }
      create_invite: { Args: { p_household_id: string }; Returns: string }
      display_cron: { Args: never; Returns: undefined }
      display_field_on: {
        Args: { p_default: boolean; p_fields: Json; p_name: string }
        Returns: boolean
      }
      display_preview: { Args: { p_household_id: string }; Returns: Json }
      display_slug: { Args: { p_name: string }; Returns: string }
      display_status: { Args: { p_household_id: string }; Returns: Json }
      ensure_journal_defaults: { Args: never; Returns: undefined }
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
      journal_photo_readable: { Args: { p_name: string }; Returns: boolean }
      move_stock: {
        Args: { p_item_id: string; p_location_id: string }
        Returns: undefined
      }
      next_due: { Args: { p_from: string; p_rule: string }; Returns: string }
      open_stock: { Args: { p_item_id: string }; Returns: undefined }
      push_display_now: { Args: { p_household_id: string }; Returns: boolean }
      seed_household_defaults: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      seed_kitchen_defaults: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      set_display_key: {
        Args: { p_household_id: string; p_key: string }
        Returns: undefined
      }
      set_task_done: {
        Args: { p_done: boolean; p_task_id: string }
        Returns: string
      }
      storage_household_member: { Args: { p_name: string }; Returns: boolean }
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
