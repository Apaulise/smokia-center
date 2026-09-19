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
      brand_account_metrics: {
        Row: {
          account_id: string
          accounts_engaged: number | null
          captured_on: string
          created_at: string
          followers_count: number | null
          follows_count: number | null
          id: string
          impressions: number | null
          media_count: number | null
          new_followers: number | null
          owner_id: string
          profile_views: number | null
          reach: number | null
          total_interactions: number | null
        }
        Insert: {
          account_id: string
          accounts_engaged?: number | null
          captured_on: string
          created_at?: string
          followers_count?: number | null
          follows_count?: number | null
          id?: string
          impressions?: number | null
          media_count?: number | null
          new_followers?: number | null
          owner_id: string
          profile_views?: number | null
          reach?: number | null
          total_interactions?: number | null
        }
        Update: {
          account_id?: string
          accounts_engaged?: number | null
          captured_on?: string
          created_at?: string
          followers_count?: number | null
          follows_count?: number | null
          id?: string
          impressions?: number | null
          media_count?: number | null
          new_followers?: number | null
          owner_id?: string
          profile_views?: number | null
          reach?: number | null
          total_interactions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_account_metrics_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "brand_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_accounts: {
        Row: {
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          last_synced_at: string | null
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          external_id: string
          id?: string
          last_synced_at?: string | null
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          external_id?: string
          id?: string
          last_synced_at?: string | null
          owner_id?: string
          platform?: Database["public"]["Enums"]["brand_platform"]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      brand_analysis_notes: {
        Row: {
          created_at: string
          hypotheses: string
          id: string
          knowns: string
          owner_id: string
          period_from: string | null
          period_to: string | null
          platform: Database["public"]["Enums"]["brand_platform"]
          unknowns: string
        }
        Insert: {
          created_at?: string
          hypotheses: string
          id?: string
          knowns: string
          owner_id: string
          period_from?: string | null
          period_to?: string | null
          platform: Database["public"]["Enums"]["brand_platform"]
          unknowns: string
        }
        Update: {
          created_at?: string
          hypotheses?: string
          id?: string
          knowns?: string
          owner_id?: string
          period_from?: string | null
          period_to?: string | null
          platform?: Database["public"]["Enums"]["brand_platform"]
          unknowns?: string
        }
        Relationships: []
      }
      brand_audience: {
        Row: {
          account_id: string
          captured_on: string
          created_at: string
          dimension: Database["public"]["Enums"]["brand_audience_dimension"]
          id: string
          owner_id: string
          size: number
          value: string
        }
        Insert: {
          account_id: string
          captured_on: string
          created_at?: string
          dimension: Database["public"]["Enums"]["brand_audience_dimension"]
          id?: string
          owner_id: string
          size: number
          value: string
        }
        Update: {
          account_id?: string
          captured_on?: string
          created_at?: string
          dimension?: Database["public"]["Enums"]["brand_audience_dimension"]
          id?: string
          owner_id?: string
          size?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_audience_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "brand_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_chat_messages: {
        Row: {
          content: Json
          created_at: string
          error: string | null
          id: string
          owner_id: string
          role: Database["public"]["Enums"]["brand_chat_role"]
          status: Database["public"]["Enums"]["job_status"]
          thread_id: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          error?: string | null
          id?: string
          owner_id: string
          role: Database["public"]["Enums"]["brand_chat_role"]
          status?: Database["public"]["Enums"]["job_status"]
          thread_id: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          error?: string | null
          id?: string
          owner_id?: string
          role?: Database["public"]["Enums"]["brand_chat_role"]
          status?: Database["public"]["Enums"]["job_status"]
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "brand_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_chat_threads: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          platform?: Database["public"]["Enums"]["brand_platform"]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brand_content_items: {
        Row: {
          caption: string | null
          created_at: string
          hashtags: string[]
          id: string
          idea: string | null
          kind: Database["public"]["Enums"]["brand_post_kind"]
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          script: string | null
          source_thread_id: string | null
          status: Database["public"]["Enums"]["brand_content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          idea?: string | null
          kind: Database["public"]["Enums"]["brand_post_kind"]
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          script?: string | null
          source_thread_id?: string | null
          status?: Database["public"]["Enums"]["brand_content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          idea?: string | null
          kind?: Database["public"]["Enums"]["brand_post_kind"]
          owner_id?: string
          platform?: Database["public"]["Enums"]["brand_platform"]
          script?: string | null
          source_thread_id?: string | null
          status?: Database["public"]["Enums"]["brand_content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_content_items_source_thread_id_fkey"
            columns: ["source_thread_id"]
            isOneToOne: false
            referencedRelation: "brand_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_knowledge: {
        Row: {
          body: string | null
          collection: Database["public"]["Enums"]["brand_knowledge_collection"]
          content_item_id: string | null
          created_at: string
          data: Json
          id: string
          origin: Database["public"]["Enums"]["brand_knowledge_origin"]
          owner_id: string
          post_id: string | null
          search: unknown
          status: Database["public"]["Enums"]["brand_knowledge_status"] | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          collection: Database["public"]["Enums"]["brand_knowledge_collection"]
          content_item_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          origin: Database["public"]["Enums"]["brand_knowledge_origin"]
          owner_id: string
          post_id?: string | null
          search?: unknown
          status?: Database["public"]["Enums"]["brand_knowledge_status"] | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          collection?: Database["public"]["Enums"]["brand_knowledge_collection"]
          content_item_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          origin?: Database["public"]["Enums"]["brand_knowledge_origin"]
          owner_id?: string
          post_id?: string | null
          search?: unknown
          status?: Database["public"]["Enums"]["brand_knowledge_status"] | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_knowledge_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "brand_content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_knowledge_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "brand_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_post_comments: {
        Row: {
          body: string | null
          commented_at: string | null
          created_at: string
          external_id: string
          id: string
          like_count: number | null
          owner_id: string
          post_id: string
          username: string | null
        }
        Insert: {
          body?: string | null
          commented_at?: string | null
          created_at?: string
          external_id: string
          id?: string
          like_count?: number | null
          owner_id: string
          post_id: string
          username?: string | null
        }
        Update: {
          body?: string | null
          commented_at?: string | null
          created_at?: string
          external_id?: string
          id?: string
          like_count?: number | null
          owner_id?: string
          post_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "brand_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_post_metrics: {
        Row: {
          captured_on: string
          comments: number | null
          created_at: string
          id: string
          impressions: number | null
          likes: number | null
          new_followers: number | null
          owner_id: string
          post_id: string
          reach: number | null
          reel_avg_watch_time_ms: number | null
          reel_skip_rate: number | null
          reel_total_watch_time_ms: number | null
          saved: number | null
          shares: number | null
          views: number | null
        }
        Insert: {
          captured_on: string
          comments?: number | null
          created_at?: string
          id?: string
          impressions?: number | null
          likes?: number | null
          new_followers?: number | null
          owner_id: string
          post_id: string
          reach?: number | null
          reel_avg_watch_time_ms?: number | null
          reel_skip_rate?: number | null
          reel_total_watch_time_ms?: number | null
          saved?: number | null
          shares?: number | null
          views?: number | null
        }
        Update: {
          captured_on?: string
          comments?: number | null
          created_at?: string
          id?: string
          impressions?: number | null
          likes?: number | null
          new_followers?: number | null
          owner_id?: string
          post_id?: string
          reach?: number | null
          reel_avg_watch_time_ms?: number | null
          reel_skip_rate?: number | null
          reel_total_watch_time_ms?: number | null
          saved?: number | null
          shares?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "brand_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_posts: {
        Row: {
          account_id: string
          caption: string | null
          created_at: string
          external_id: string
          id: string
          kind: Database["public"]["Enums"]["brand_post_kind"]
          media_url: string | null
          owner_id: string
          permalink: string | null
          published_at: string | null
          raw: Json | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          caption?: string | null
          created_at?: string
          external_id: string
          id?: string
          kind: Database["public"]["Enums"]["brand_post_kind"]
          media_url?: string | null
          owner_id: string
          permalink?: string | null
          published_at?: string | null
          raw?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          caption?: string | null
          created_at?: string
          external_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["brand_post_kind"]
          media_url?: string | null
          owner_id?: string
          permalink?: string | null
          published_at?: string | null
          raw?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "brand_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_recommendations: {
        Row: {
          body: string
          created_at: string
          evidence: Json
          id: string
          kind: Database["public"]["Enums"]["brand_recommendation_kind"]
          objective:
            | Database["public"]["Enums"]["brand_recommendation_objective"]
            | null
          owner_id: string
          period_from: string | null
          period_to: string | null
          platform: Database["public"]["Enums"]["brand_platform"]
          status: Database["public"]["Enums"]["brand_recommendation_status"]
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          evidence?: Json
          id?: string
          kind: Database["public"]["Enums"]["brand_recommendation_kind"]
          objective?:
            | Database["public"]["Enums"]["brand_recommendation_objective"]
            | null
          owner_id: string
          period_from?: string | null
          period_to?: string | null
          platform: Database["public"]["Enums"]["brand_platform"]
          status?: Database["public"]["Enums"]["brand_recommendation_status"]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          evidence?: Json
          id?: string
          kind?: Database["public"]["Enums"]["brand_recommendation_kind"]
          objective?:
            | Database["public"]["Enums"]["brand_recommendation_objective"]
            | null
          owner_id?: string
          period_from?: string | null
          period_to?: string | null
          platform?: Database["public"]["Enums"]["brand_platform"]
          status?: Database["public"]["Enums"]["brand_recommendation_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_sync_jobs: {
        Row: {
          created_at: string
          date_from: string | null
          date_to: string | null
          error: string | null
          finished_at: string | null
          id: string
          items_imported: number
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          items_imported?: number
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          items_imported?: number
          owner_id?: string
          platform?: Database["public"]["Enums"]["brand_platform"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: []
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
      brand_account_summary: {
        Args: {
          days?: number
          p_platform: Database["public"]["Enums"]["brand_platform"]
        }
        Returns: {
          account_id: string
          display_name: string
          followers_at_oldest: number
          followers_count: number
          follows_count: number
          media_count: number
          oldest_snapshot_on: string
          username: string
        }[]
      }
      brand_audience_summary: {
        Args: { p_platform: Database["public"]["Enums"]["brand_platform"] }
        Returns: {
          dimension: Database["public"]["Enums"]["brand_audience_dimension"]
          size: number
          value: string
        }[]
      }
      brand_content_views_total: {
        Args: { p_platform: Database["public"]["Enums"]["brand_platform"] }
        Returns: number
      }
      brand_latest_posts: {
        Args: {
          p_limit?: number
          p_platform: Database["public"]["Enums"]["brand_platform"]
        }
        Returns: {
          caption: string
          comments: number
          kind: Database["public"]["Enums"]["brand_post_kind"]
          likes: number
          new_followers: number
          permalink: string
          post_id: string
          published_at: string
          reach: number
          reel_avg_watch_time_ms: number
          reel_skip_rate: number
          saved: number
          shares: number
          thumbnail_url: string
          views: number
        }[]
      }
      brand_metrics_timeline: {
        Args: {
          days?: number
          p_platform: Database["public"]["Enums"]["brand_platform"]
        }
        Returns: {
          day: string
          followers_count: number
          reach: number
          total_interactions: number
        }[]
      }
      leads_activity_timeline: {
        Args: { days?: number }
        Returns: {
          contacted: number
          day: string
          won: number
        }[]
      }
      leads_by_industry: {
        Args: never
        Returns: {
          color: string
          industry_id: string
          lead_count: number
          name: string
        }[]
      }
      leads_dashboard_summary: {
        Args: never
        Returns: {
          contacted: number
          conversion_rate: number
          scheduled: number
          total_leads: number
          won: number
        }[]
      }
      leads_funnel_by_status: {
        Args: never
        Returns: {
          lead_count: number
          status: Database["public"]["Enums"]["lead_status"]
        }[]
      }
      leads_performance_by_list: {
        Args: never
        Returns: {
          criteria: Json
          industry_color: string
          industry_name: string
          lead_count: number
          list_id: string
          name: string
          source: Database["public"]["Enums"]["lead_source"]
          win_rate: number
          won_count: number
        }[]
      }
    }
    Enums: {
      appointment_status:
        | "AGENDADA"
        | "CONFIRMADA"
        | "REALIZADA"
        | "NO_ASISTIO"
        | "CANCELADA"
      brand_audience_dimension: "EDAD" | "GENERO" | "CIUDAD" | "PAIS"
      brand_chat_role: "USUARIO" | "ASISTENTE"
      brand_content_status:
        | "IDEA"
        | "GUION"
        | "GRABADO"
        | "EDITADO"
        | "LISTO"
        | "PUBLICADO"
      brand_knowledge_collection:
        | "WINNERS"
        | "LOSERS"
        | "HOOKS"
        | "FORMATOS"
        | "TEMAS"
        | "AUDIENCIA"
        | "RADAR"
        | "EXPERIMENTOS"
        | "APRENDIZAJES"
      brand_knowledge_origin: "PROPIO" | "MERCADO" | "HIPOTESIS"
      brand_knowledge_status: "PENDIENTE" | "ACTIVO" | "CONCLUIDO"
      brand_platform: "INSTAGRAM" | "YOUTUBE"
      brand_post_kind:
        | "REEL"
        | "POST"
        | "CARRUSEL"
        | "HISTORIA"
        | "VIDEO"
        | "SHORT"
      brand_recommendation_kind: "REPETIR" | "CORTAR" | "PROBAR"
      brand_recommendation_objective: "ALCANCE" | "AUTORIDAD" | "CONVERSION"
      brand_recommendation_status: "NUEVA" | "APLICADA" | "DESCARTADA"
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
      brand_audience_dimension: ["EDAD", "GENERO", "CIUDAD", "PAIS"],
      brand_chat_role: ["USUARIO", "ASISTENTE"],
      brand_content_status: [
        "IDEA",
        "GUION",
        "GRABADO",
        "EDITADO",
        "LISTO",
        "PUBLICADO",
      ],
      brand_knowledge_collection: [
        "WINNERS",
        "LOSERS",
        "HOOKS",
        "FORMATOS",
        "TEMAS",
        "AUDIENCIA",
        "RADAR",
        "EXPERIMENTOS",
        "APRENDIZAJES",
      ],
      brand_knowledge_origin: ["PROPIO", "MERCADO", "HIPOTESIS"],
      brand_knowledge_status: ["PENDIENTE", "ACTIVO", "CONCLUIDO"],
      brand_platform: ["INSTAGRAM", "YOUTUBE"],
      brand_post_kind: [
        "REEL",
        "POST",
        "CARRUSEL",
        "HISTORIA",
        "VIDEO",
        "SHORT",
      ],
      brand_recommendation_kind: ["REPETIR", "CORTAR", "PROBAR"],
      brand_recommendation_objective: ["ALCANCE", "AUTORIDAD", "CONVERSION"],
      brand_recommendation_status: ["NUEVA", "APLICADA", "DESCARTADA"],
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
