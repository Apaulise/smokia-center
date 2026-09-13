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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          lead_id: string | null
          meeting_url: string | null
          notes: string | null
          owner_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          lead_id?: string | null
          meeting_url?: string | null
          notes?: string | null
          owner_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          lead_id?: string | null
          meeting_url?: string | null
          notes?: string | null
          owner_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          content: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["lead_status"] | null
          id: string
          lead_id: string
          occurred_at: string
          owner_id: string
          to_status: Database["public"]["Enums"]["lead_status"] | null
          type: Database["public"]["Enums"]["lead_activity_type"]
        }
        Insert: {
          content?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          lead_id: string
          occurred_at?: string
          owner_id: string
          to_status?: Database["public"]["Enums"]["lead_status"] | null
          type: Database["public"]["Enums"]["lead_activity_type"]
        }
        Update: {
          content?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          lead_id?: string
          occurred_at?: string
          owner_id?: string
          to_status?: Database["public"]["Enums"]["lead_status"] | null
          type?: Database["public"]["Enums"]["lead_activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_lists: {
        Row: {
          created_at: string
          criteria: Json
          id: string
          industry_id: string | null
          lead_count: number
          name: string
          owner_id: string
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          id?: string
          industry_id?: string | null
          lead_count?: number
          name: string
          owner_id: string
          source: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          id?: string
          industry_id?: string | null
          lead_count?: number
          name?: string
          owner_id?: string
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_lists_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          dedupe_key: string
          email: string | null
          external_id: string | null
          id: string
          industry_id: string | null
          instagram_url: string | null
          last_contacted_at: string | null
          latitude: number | null
          lead_list_id: string | null
          linkedin_url: string | null
          longitude: number | null
          name: string
          next_action_at: string | null
          notes: string | null
          owner_id: string
          phone: string | null
          rating: number | null
          raw: Json | null
          region: string | null
          reviews_count: number | null
          source_url: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dedupe_key: string
          email?: string | null
          external_id?: string | null
          id?: string
          industry_id?: string | null
          instagram_url?: string | null
          last_contacted_at?: string | null
          latitude?: number | null
          lead_list_id?: string | null
          linkedin_url?: string | null
          longitude?: number | null
          name: string
          next_action_at?: string | null
          notes?: string | null
          owner_id: string
          phone?: string | null
          rating?: number | null
          raw?: Json | null
          region?: string | null
          reviews_count?: number | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dedupe_key?: string
          email?: string | null
          external_id?: string | null
          id?: string
          industry_id?: string | null
          instagram_url?: string | null
          last_contacted_at?: string | null
          latitude?: number | null
          lead_list_id?: string | null
          linkedin_url?: string | null
          longitude?: number | null
          name?: string
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          rating?: number | null
          raw?: Json | null
          region?: string | null
          reviews_count?: number | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_lead_list_id_fkey"
            columns: ["lead_list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          actor_id: string
          apify_dataset_id: string | null
          apify_run_id: string | null
          cost_usd: number | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          items_imported: number
          lead_list_id: string
          owner_id: string
          provider: Database["public"]["Enums"]["lead_source"]
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          actor_id: string
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          items_imported?: number
          lead_list_id: string
          owner_id: string
          provider: Database["public"]["Enums"]["lead_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          actor_id?: string
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          items_imported?: number
          lead_list_id?: string
          owner_id?: string
          provider?: Database["public"]["Enums"]["lead_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_jobs_lead_list_id_fkey"
            columns: ["lead_list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          owner_id: string
          updated_at: string
          value_encrypted: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          owner_id: string
          updated_at?: string
          value_encrypted: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          owner_id?: string
          updated_at?: string
          value_encrypted?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      appointment_status:
        | "AGENDADA"
        | "CONFIRMADA"
        | "REALIZADA"
        | "NO_ASISTIO"
        | "CANCELADA"
      job_status: "PENDIENTE" | "EN_CURSO" | "COMPLETADO" | "FALLIDO"
      lead_activity_type:
        | "NOTA"
        | "WHATSAPP"
        | "EMAIL"
        | "LLAMADA"
        | "CAMBIO_ESTADO"
        | "REUNION"
      lead_source: "GOOGLE_MAPS" | "INSTAGRAM" | "LINKEDIN" | "CSV" | "MANUAL"
      lead_status:
        | "NUEVO"
        | "CONTACTADO"
        | "RESPONDIO"
        | "AGENDADO"
        | "PROPUESTA_ENVIADA"
        | "CERRADO_GANADO"
        | "CERRADO_PERDIDO"
        | "DESCARTADO"
      message_channel: "WHATSAPP" | "EMAIL"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_status: [
        "AGENDADA",
        "CONFIRMADA",
        "REALIZADA",
        "NO_ASISTIO",
        "CANCELADA",
      ],
      job_status: ["PENDIENTE", "EN_CURSO", "COMPLETADO", "FALLIDO"],
      lead_activity_type: [
        "NOTA",
        "WHATSAPP",
        "EMAIL",
        "LLAMADA",
        "CAMBIO_ESTADO",
        "REUNION",
      ],
      lead_source: ["GOOGLE_MAPS", "INSTAGRAM", "LINKEDIN", "CSV", "MANUAL"],
      lead_status: [
        "NUEVO",
        "CONTACTADO",
        "RESPONDIO",
        "AGENDADO",
        "PROPUESTA_ENVIADA",
        "CERRADO_GANADO",
        "CERRADO_PERDIDO",
        "DESCARTADO",
      ],
      message_channel: ["WHATSAPP", "EMAIL"],
    },
  },
} as const
