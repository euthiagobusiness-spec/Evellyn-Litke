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
      consents: {
        Row: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string
          granted: boolean
          id: string
          ip_hash: string | null
          lead_id: string
          policy_version: string
          revoked_at: string | null
          source_page: string
          user_agent: string | null
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          granted: boolean
          id?: string
          ip_hash?: string | null
          lead_id: string
          policy_version: string
          revoked_at?: string | null
          source_page: string
          user_agent?: string | null
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          granted?: boolean
          id?: string
          ip_hash?: string | null
          lead_id?: string
          policy_version?: string
          revoked_at?: string | null
          source_page?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string
          email_normalized: string | null
          external_customer_id: string | null
          id: string
          lead_id: string | null
          name: string
          phone: string | null
          phone_e164: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_normalized?: string | null
          external_customer_id?: string | null
          id?: string
          lead_id?: string | null
          name: string
          phone?: string | null
          phone_e164?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_normalized?: string | null
          external_customer_id?: string | null
          id?: string
          lead_id?: string | null
          name?: string
          phone?: string | null
          phone_e164?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_events: {
        Row: {
          created_at: string
          customer_id: string | null
          event_name: Database["public"]["Enums"]["funnel_event_name"]
          id: string
          lead_id: string | null
          metadata: Json
          order_id: string | null
          page: string | null
          session_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          event_name: Database["public"]["Enums"]["funnel_event_name"]
          id?: string
          lead_id?: string | null
          metadata?: Json
          order_id?: string | null
          page?: string | null
          session_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          event_name?: Database["public"]["Enums"]["funnel_event_name"]
          id?: string
          lead_id?: string | null
          metadata?: Json
          order_id?: string | null
          page?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_rate_limits: {
        Row: {
          endpoint: string
          id: number
          ip_hash: string
          request_count: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          endpoint: string
          id?: never
          ip_hash: string
          request_count?: number
          updated_at?: string
          window_started_at: string
        }
        Update: {
          endpoint?: string
          id?: never
          ip_hash?: string
          request_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          audience_size: string | null
          biggest_challenge: string | null
          business_stage: string | null
          country_calling_code: string | null
          country_iso: string | null
          created_at: string
          email: string
          email_normalized: string | null
          fbclid: string | null
          funnel_stage: Database["public"]["Enums"]["funnel_stage"]
          gclid: string | null
          goal: string | null
          id: string
          instagram_handle: string | null
          landing_path: string | null
          lead_status: Database["public"]["Enums"]["lead_status"]
          name: string
          niche: string | null
          phone: string
          phone_e164: string
          public_reference: string
          preferred_contact_period: string | null
          referrer: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp_clicked_at: string | null
        }
        Insert: {
          audience_size?: string | null
          biggest_challenge?: string | null
          business_stage?: string | null
          country_calling_code?: string | null
          country_iso?: string | null
          created_at?: string
          email: string
          email_normalized?: string | null
          fbclid?: string | null
          funnel_stage?: Database["public"]["Enums"]["funnel_stage"]
          gclid?: string | null
          goal?: string | null
          id?: string
          instagram_handle?: string | null
          landing_path?: string | null
          lead_status?: Database["public"]["Enums"]["lead_status"]
          name: string
          niche?: string | null
          phone: string
          phone_e164: string
          public_reference?: string
          preferred_contact_period?: string | null
          referrer?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp_clicked_at?: string | null
        }
        Update: {
          audience_size?: string | null
          biggest_challenge?: string | null
          business_stage?: string | null
          country_calling_code?: string | null
          country_iso?: string | null
          created_at?: string
          email?: string
          email_normalized?: string | null
          fbclid?: string | null
          funnel_stage?: Database["public"]["Enums"]["funnel_stage"]
          gclid?: string | null
          goal?: string | null
          id?: string
          instagram_handle?: string | null
          landing_path?: string | null
          lead_status?: Database["public"]["Enums"]["lead_status"]
          name?: string
          niche?: string | null
          phone?: string
          phone_e164?: string
          public_reference?: string
          preferred_contact_period?: string | null
          referrer?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp_clicked_at?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          amount: number
          created_at: string
          currency: string
          external_item_id: string | null
          id: string
          item_type: Database["public"]["Enums"]["product_type"]
          order_id: string
          product_id: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          external_item_id?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["product_type"]
          order_id: string
          product_id: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          external_item_id?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["product_type"]
          order_id?: string
          product_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved_at: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_id: string
          external_transaction_id: string
          id: string
          payment_method: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
          upsell_status: Database["public"]["Enums"]["upsell_status"]
        }
        Insert: {
          approved_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          external_transaction_id: string
          id?: string
          payment_method?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at?: string
          upsell_status?: Database["public"]["Enums"]["upsell_status"]
        }
        Update: {
          approved_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          external_transaction_id?: string
          id?: string
          payment_method?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
          upsell_status?: Database["public"]["Enums"]["upsell_status"]
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          external_payment_id: string | null
          failed_at: string | null
          id: string
          order_id: string
          paid_at: string | null
          payment_method: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          external_payment_id?: string | null
          failed_at?: string | null
          id?: string
          order_id: string
          paid_at?: string | null
          payment_method?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          external_payment_id?: string | null
          failed_at?: string | null
          id?: string
          order_id?: string
          paid_at?: string | null
          payment_method?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          external_product_id: string | null
          id: string
          name: string
          price: number | null
          product_type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          external_product_id?: string | null
          id?: string
          name: string
          price?: number | null
          product_type: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          external_product_id?: string | null
          id?: string
          name?: string
          price?: number | null
          product_type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_type: string
          external_event_id: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          processing_error: string | null
          provider: string
          received_at: string
          transaction_id: string | null
        }
        Insert: {
          event_type: string
          external_event_id: string
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          received_at?: string
          transaction_id?: string | null
        }
        Update: {
          event_type?: string
          external_event_id?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          received_at?: string
          transaction_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      capture_lead_secure: {
        Args: {
          p_business_stage: string
          p_consent_analytics: boolean
          p_consent_marketing: boolean
          p_consent_privacy: boolean
          p_email: string
          p_fbclid: string
          p_gclid: string
          p_goal: string
          p_ip_hash: string
          p_landing_path: string
          p_metadata: Json
          p_name: string
          p_phone: string
          p_phone_e164: string
          p_policy_version: string
          p_referrer: string
          p_session_id: string
          p_source_page: string
          p_user_agent: string
          p_utm_campaign: string
          p_utm_content: string
          p_utm_medium: string
          p_utm_source: string
          p_utm_term: string
        }
        Returns: Json
      }
      capture_lead_secure_v2: {
        Args: {
          p_audience_size: string
          p_biggest_challenge: string
          p_business_stage: string
          p_consent_analytics: boolean
          p_consent_marketing: boolean
          p_consent_privacy: boolean
          p_country_calling_code: string
          p_country_iso: string
          p_email: string
          p_fbclid: string
          p_gclid: string
          p_goal: string
          p_instagram_handle: string
          p_ip_hash: string
          p_landing_path: string
          p_metadata: Json
          p_name: string
          p_niche: string
          p_phone: string
          p_phone_e164: string
          p_policy_version: string
          p_preferred_contact_period: string
          p_referrer: string
          p_session_id: string
          p_source_page: string
          p_user_agent: string
          p_utm_campaign: string
          p_utm_content: string
          p_utm_medium: string
          p_utm_source: string
          p_utm_term: string
        }
        Returns: Json
      }
      check_lead_rate_limit_secure: {
        Args: {
          p_endpoint: string
          p_ip_hash: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: Json
      }
      track_funnel_event_secure: {
        Args: {
          p_event_name: Database["public"]["Enums"]["funnel_event_name"]
          p_lead_reference: string
          p_metadata: Json
          p_page: string
          p_session_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      consent_type:
        | "privacy_policy"
        | "marketing_email"
        | "marketing_whatsapp"
        | "analytics"
      funnel_event_name:
        | "lead_created"
        | "lead_updated"
        | "thank_you_registration_viewed"
        | "whatsapp_clicked"
        | "sales_page_viewed"
        | "checkout_clicked"
        | "payment_started"
        | "payment_pending"
        | "payment_approved"
        | "upsell_viewed"
        | "upsell_accepted"
        | "upsell_declined"
        | "upsell_purchased"
        | "thank_you_purchase_viewed"
        | "order_cancelled"
        | "order_refunded"
      funnel_stage:
        | "captured"
        | "registered"
        | "whatsapp"
        | "sales_page"
        | "checkout"
        | "customer"
      lead_status: "active" | "inactive" | "unsubscribed" | "customer"
      order_status:
        | "pending"
        | "under_review"
        | "approved"
        | "completed"
        | "cancelled"
        | "expired"
        | "refunded"
        | "chargeback"
      payment_status:
        | "pending"
        | "under_review"
        | "approved"
        | "failed"
        | "cancelled"
        | "refunded"
        | "chargeback"
      product_type: "main_product" | "order_bump" | "upsell" | "downsell"
      upsell_status: "not_offered" | "pending" | "accepted" | "declined"
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
      consent_type: [
        "privacy_policy",
        "marketing_email",
        "marketing_whatsapp",
        "analytics",
      ],
      funnel_event_name: [
        "lead_created",
        "lead_updated",
        "thank_you_registration_viewed",
        "whatsapp_clicked",
        "sales_page_viewed",
        "checkout_clicked",
        "payment_started",
        "payment_pending",
        "payment_approved",
        "upsell_viewed",
        "upsell_accepted",
        "upsell_declined",
        "upsell_purchased",
        "thank_you_purchase_viewed",
        "order_cancelled",
        "order_refunded",
      ],
      funnel_stage: [
        "captured",
        "registered",
        "whatsapp",
        "sales_page",
        "checkout",
        "customer",
      ],
      lead_status: ["active", "inactive", "unsubscribed", "customer"],
      order_status: [
        "pending",
        "under_review",
        "approved",
        "completed",
        "cancelled",
        "expired",
        "refunded",
        "chargeback",
      ],
      payment_status: [
        "pending",
        "under_review",
        "approved",
        "failed",
        "cancelled",
        "refunded",
        "chargeback",
      ],
      product_type: ["main_product", "order_bump", "upsell", "downsell"],
      upsell_status: ["not_offered", "pending", "accepted", "declined"],
    },
  },
} as const
