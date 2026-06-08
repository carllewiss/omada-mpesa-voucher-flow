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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      client_authorizations: {
        Row: {
          amount: number
          ap_mac: string | null
          authorization_status: string
          checkout_request_id: string | null
          client_ip: string | null
          created_at: string
          duration_hours: number
          id: string
          mac_address: string | null
          mpesa_receipt: string | null
          package_type: string
          payment_status: string
          phone_number: string
          ssid: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          ap_mac?: string | null
          authorization_status?: string
          checkout_request_id?: string | null
          client_ip?: string | null
          created_at?: string
          duration_hours?: number
          id?: string
          mac_address?: string | null
          mpesa_receipt?: string | null
          package_type?: string
          payment_status?: string
          phone_number: string
          ssid?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          ap_mac?: string | null
          authorization_status?: string
          checkout_request_id?: string | null
          client_ip?: string | null
          created_at?: string
          duration_hours?: number
          id?: string
          mac_address?: string | null
          mpesa_receipt?: string | null
          package_type?: string
          payment_status?: string
          phone_number?: string
          ssid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      package_pricing: {
        Row: {
          display_name: string
          duration_hours: number
          package_type: string
          price_kes: number
          updated_at: string
        }
        Insert: {
          display_name: string
          duration_hours: number
          package_type: string
          price_kes: number
          updated_at?: string
        }
        Update: {
          display_name?: string
          duration_hours?: number
          package_type?: string
          price_kes?: number
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          ap_mac: string | null
          authenticated_at: string | null
          checkout_request_id: string | null
          client_mac: string | null
          created_at: string
          id: string
          merchant_request_id: string | null
          mpesa_receipt: string | null
          package_type: string
          phone_number: string
          result_code: number | null
          result_desc: string | null
          session_id: string | null
          ssid: string | null
          status: string
          updated_at: string
          voucher_code: string | null
        }
        Insert: {
          amount: number
          ap_mac?: string | null
          authenticated_at?: string | null
          checkout_request_id?: string | null
          client_mac?: string | null
          created_at?: string
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          package_type?: string
          phone_number: string
          result_code?: number | null
          result_desc?: string | null
          session_id?: string | null
          ssid?: string | null
          status?: string
          updated_at?: string
          voucher_code?: string | null
        }
        Update: {
          amount?: number
          ap_mac?: string | null
          authenticated_at?: string | null
          checkout_request_id?: string | null
          client_mac?: string | null
          created_at?: string
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          package_type?: string
          phone_number?: string
          result_code?: number | null
          result_desc?: string | null
          session_id?: string | null
          ssid?: string | null
          status?: string
          updated_at?: string
          voucher_code?: string | null
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          code: string
          created_at: string
          duration_hours: number
          id: string
          is_used: boolean
          package_type: string
          reserved_for_mac: string | null
          reserved_for_session: string | null
          reserved_until: string | null
          status: string
          transaction_id: string | null
          used_at: string | null
          used_by_mac: string | null
        }
        Insert: {
          code: string
          created_at?: string
          duration_hours?: number
          id?: string
          is_used?: boolean
          package_type?: string
          reserved_for_mac?: string | null
          reserved_for_session?: string | null
          reserved_until?: string | null
          status?: string
          transaction_id?: string | null
          used_at?: string | null
          used_by_mac?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          duration_hours?: number
          id?: string
          is_used?: boolean
          package_type?: string
          reserved_for_mac?: string | null
          reserved_for_session?: string | null
          reserved_until?: string | null
          status?: string
          transaction_id?: string | null
          used_at?: string | null
          used_by_mac?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_voucher_for_package: {
        Args: { _client_mac?: string; _package_type: string }
        Returns: {
          code: string
          duration_hours: number
          package_type: string
        }[]
      }
      confirm_voucher_used: {
        Args: { _client_mac: string; _transaction_id: string }
        Returns: boolean
      }
      release_expired_reservations: { Args: never; Returns: number }
      release_voucher_for_transaction: {
        Args: { _transaction_id: string }
        Returns: boolean
      }
      reserve_voucher_for_transaction: {
        Args: {
          _client_mac: string
          _hold_minutes?: number
          _package_type: string
          _session_id: string
          _transaction_id: string
        }
        Returns: {
          code: string
          duration_hours: number
          package_type: string
          status: string
        }[]
      }
      resume_session_for_mac: {
        Args: { _client_mac: string }
        Returns: {
          authenticated: boolean
          duration_hours: number
          package_type: string
          paid_at: string
          transaction_id: string
          voucher_code: string
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
