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
    PostgrestVersion: "14.17"
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
      brand_competitor_posts: {
        Row: {
          caption: string | null
          comments: number | null
          competitor_id: string
          created_at: string
          dismissed_at: string | null
          external_id: string
          id: string
          is_pinned: boolean
          kind: Database["public"]["Enums"]["brand_post_kind"]
          likes: number | null
          owner_id: string
          permalink: string | null
          published_at: string | null
          raw: Json | null
          relevance_checked_at: string | null
          relevance_reason: string | null
          relevance_score: number | null
          thumbnail_url: string | null
          updated_at: string
          views: number | null
        }
        Insert: {
          caption?: string | null
          comments?: number | null
          competitor_id: string
          created_at?: string
          dismissed_at?: string | null
          external_id: string
          id?: string
          is_pinned?: boolean
          kind: Database["public"]["Enums"]["brand_post_kind"]
          likes?: number | null
          owner_id: string
          permalink?: string | null
          published_at?: string | null
          raw?: Json | null
          relevance_checked_at?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          views?: number | null
        }
        Update: {
          caption?: string | null
          comments?: number | null
          competitor_id?: string
          created_at?: string
          dismissed_at?: string | null
          external_id?: string
          id?: string
          is_pinned?: boolean
          kind?: Database["public"]["Enums"]["brand_post_kind"]
          likes?: number | null
          owner_id?: string
          permalink?: string | null
          published_at?: string | null
          raw?: Json | null
          relevance_checked_at?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_competitor_posts_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "brand_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_competitors: {
        Row: {
          apify_run_id: string | null
          created_at: string
          display_name: string | null
          id: string
          last_cost_usd: number | null
          last_error: string | null
          last_run_started_at: string | null
          last_synced_at: string | null
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          profile_pic_url: string | null
          results_limit: number
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          username: string
        }
        Insert: {
          apify_run_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_cost_usd?: number | null
          last_error?: string | null
          last_run_started_at?: string | null
          last_synced_at?: string | null
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          profile_pic_url?: string | null
          results_limit?: number
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          username: string
        }
        Update: {
          apify_run_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_cost_usd?: number | null
          last_error?: string | null
          last_run_started_at?: string | null
          last_synced_at?: string | null
          owner_id?: string
          platform?: Database["public"]["Enums"]["brand_platform"]
          profile_pic_url?: string | null
          results_limit?: number
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      brand_content_items: {
        Row: {
          analysis_attempts: number
          analysis_error: string | null
          analysis_status: string | null
          angle: string | null
          caption: string | null
          created_at: string
          external_id: string | null
          hashtags: string[]
          hook: string | null
          hypothesis: string | null
          id: string
          idea: string | null
          imported_from_post: boolean
          kind: Database["public"]["Enums"]["brand_post_kind"]
          knowledge_id: string | null
          media: Json
          objective:
            | Database["public"]["Enums"]["brand_recommendation_objective"]
            | null
          owner_id: string
          parent_item_id: string | null
          platform: Database["public"]["Enums"]["brand_platform"]
          post_id: string | null
          publish_error: string | null
          publish_started_at: string | null
          published_at: string | null
          scheduled_for: string | null
          script: string | null
          source_competitor_post_id: string | null
          source_thread_id: string | null
          source_trend_post_id: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["brand_content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          analysis_attempts?: number
          analysis_error?: string | null
          analysis_status?: string | null
          angle?: string | null
          caption?: string | null
          created_at?: string
          external_id?: string | null
          hashtags?: string[]
          hook?: string | null
          hypothesis?: string | null
          id?: string
          idea?: string | null
          imported_from_post?: boolean
          kind: Database["public"]["Enums"]["brand_post_kind"]
          knowledge_id?: string | null
          media?: Json
          objective?:
            | Database["public"]["Enums"]["brand_recommendation_objective"]
            | null
          owner_id: string
          parent_item_id?: string | null
          platform: Database["public"]["Enums"]["brand_platform"]
          post_id?: string | null
          publish_error?: string | null
          publish_started_at?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          script?: string | null
          source_competitor_post_id?: string | null
          source_thread_id?: string | null
          source_trend_post_id?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["brand_content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          analysis_attempts?: number
          analysis_error?: string | null
          analysis_status?: string | null
          angle?: string | null
          caption?: string | null
          created_at?: string
          external_id?: string | null
          hashtags?: string[]
          hook?: string | null
          hypothesis?: string | null
          id?: string
          idea?: string | null
          imported_from_post?: boolean
          kind?: Database["public"]["Enums"]["brand_post_kind"]
          knowledge_id?: string | null
          media?: Json
          objective?:
            | Database["public"]["Enums"]["brand_recommendation_objective"]
            | null
          owner_id?: string
          parent_item_id?: string | null
          platform?: Database["public"]["Enums"]["brand_platform"]
          post_id?: string | null
          publish_error?: string | null
          publish_started_at?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          script?: string | null
          source_competitor_post_id?: string | null
          source_thread_id?: string | null
          source_trend_post_id?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["brand_content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_content_items_knowledge_id_fkey"
            columns: ["knowledge_id"]
            isOneToOne: false
            referencedRelation: "brand_knowledge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_content_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "brand_content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_content_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "brand_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_content_items_source_competitor_post_id_fkey"
            columns: ["source_competitor_post_id"]
            isOneToOne: false
            referencedRelation: "brand_competitor_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_content_items_source_thread_id_fkey"
            columns: ["source_thread_id"]
            isOneToOne: false
            referencedRelation: "brand_chat_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_content_items_source_trend_post_id_fkey"
            columns: ["source_trend_post_id"]
            isOneToOne: false
            referencedRelation: "brand_trend_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_goals: {
        Row: {
          baseline_date: string
          baseline_followers: number
          created_at: string
          deadline: string | null
          id: string
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          status: Database["public"]["Enums"]["brand_goal_status"]
          target_followers: number
          updated_at: string
        }
        Insert: {
          baseline_date: string
          baseline_followers: number
          created_at?: string
          deadline?: string | null
          id?: string
          owner_id: string
          platform: Database["public"]["Enums"]["brand_platform"]
          status?: Database["public"]["Enums"]["brand_goal_status"]
          target_followers: number
          updated_at?: string
        }
        Update: {
          baseline_date?: string
          baseline_followers?: number
          created_at?: string
          deadline?: string | null
          id?: string
          owner_id?: string
          platform?: Database["public"]["Enums"]["brand_platform"]
          status?: Database["public"]["Enums"]["brand_goal_status"]
          target_followers?: number
          updated_at?: string
        }
        Relationships: []
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
      brand_trend_posts: {
        Row: {
          caption: string | null
          comments: number | null
          created_at: string
          dismissed_at: string | null
          display_name: string | null
          external_id: string
          id: string
          kind: Database["public"]["Enums"]["brand_post_kind"]
          likes: number | null
          owner_id: string
          permalink: string | null
          profile_pic_url: string | null
          published_at: string | null
          raw: Json | null
          relevance_checked_at: string | null
          relevance_reason: string | null
          relevance_score: number | null
          search_id: string | null
          source: Database["public"]["Enums"]["trend_source"]
          thumbnail_url: string | null
          updated_at: string
          username: string | null
          views: number | null
        }
        Insert: {
          caption?: string | null
          comments?: number | null
          created_at?: string
          dismissed_at?: string | null
          display_name?: string | null
          external_id: string
          id?: string
          kind: Database["public"]["Enums"]["brand_post_kind"]
          likes?: number | null
          owner_id: string
          permalink?: string | null
          profile_pic_url?: string | null
          published_at?: string | null
          raw?: Json | null
          relevance_checked_at?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          search_id?: string | null
          source?: Database["public"]["Enums"]["trend_source"]
          thumbnail_url?: string | null
          updated_at?: string
          username?: string | null
          views?: number | null
        }
        Update: {
          caption?: string | null
          comments?: number | null
          created_at?: string
          dismissed_at?: string | null
          display_name?: string | null
          external_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["brand_post_kind"]
          likes?: number | null
          owner_id?: string
          permalink?: string | null
          profile_pic_url?: string | null
          published_at?: string | null
          raw?: Json | null
          relevance_checked_at?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          search_id?: string | null
          source?: Database["public"]["Enums"]["trend_source"]
          thumbnail_url?: string | null
          updated_at?: string
          username?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_trend_posts_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "brand_trend_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_trend_searches: {
        Row: {
          apify_run_id: string | null
          created_at: string
          id: string
          last_cost_usd: number | null
          last_error: string | null
          last_run_started_at: string | null
          last_synced_at: string | null
          owner_id: string
          query: string
          results_limit: number
          source: Database["public"]["Enums"]["trend_source"]
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          apify_run_id?: string | null
          created_at?: string
          id?: string
          last_cost_usd?: number | null
          last_error?: string | null
          last_run_started_at?: string | null
          last_synced_at?: string | null
          owner_id: string
          query: string
          results_limit: number
          source?: Database["public"]["Enums"]["trend_source"]
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          apify_run_id?: string | null
          created_at?: string
          id?: string
          last_cost_usd?: number | null
          last_error?: string | null
          last_run_started_at?: string | null
          last_synced_at?: string | null
          owner_id?: string
          query?: string
          results_limit?: number
          source?: Database["public"]["Enums"]["trend_source"]
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
      lead_intel: {
        Row: {
          created_at: string
          enriched_at: string | null
          enrichment: Json | null
          id: string
          lead_id: string
          memory: Json | null
          next_best_action:
            | Database["public"]["Enums"]["lead_next_action"]
            | null
          next_best_action_reason: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enriched_at?: string | null
          enrichment?: Json | null
          id?: string
          lead_id: string
          memory?: Json | null
          next_best_action?:
            | Database["public"]["Enums"]["lead_next_action"]
            | null
          next_best_action_reason?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enriched_at?: string | null
          enrichment?: Json | null
          id?: string
          lead_id?: string
          memory?: Json | null
          next_best_action?:
            | Database["public"]["Enums"]["lead_next_action"]
            | null
          next_best_action_reason?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_intel_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
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
      lead_messages: {
        Row: {
          analysis: Json | null
          angle: Database["public"]["Enums"]["lead_sales_angle"] | null
          channel: Database["public"]["Enums"]["message_channel"]
          confirmed: boolean
          confirmed_at: string | null
          content: string
          created_at: string
          edit_distance: number | null
          generated_by:
            | Database["public"]["Enums"]["lead_message_generator"]
            | null
          generated_content: string | null
          id: string
          kind: Database["public"]["Enums"]["lead_message_kind"] | null
          lead_id: string
          occurred_at: string
          owner_id: string
          sender: Database["public"]["Enums"]["lead_message_sender"]
          style_excluded: boolean
          variant: number | null
        }
        Insert: {
          analysis?: Json | null
          angle?: Database["public"]["Enums"]["lead_sales_angle"] | null
          channel?: Database["public"]["Enums"]["message_channel"]
          confirmed?: boolean
          confirmed_at?: string | null
          content: string
          created_at?: string
          edit_distance?: number | null
          generated_by?:
            | Database["public"]["Enums"]["lead_message_generator"]
            | null
          generated_content?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["lead_message_kind"] | null
          lead_id: string
          occurred_at?: string
          owner_id: string
          sender: Database["public"]["Enums"]["lead_message_sender"]
          style_excluded?: boolean
          variant?: number | null
        }
        Update: {
          analysis?: Json | null
          angle?: Database["public"]["Enums"]["lead_sales_angle"] | null
          channel?: Database["public"]["Enums"]["message_channel"]
          confirmed?: boolean
          confirmed_at?: string | null
          content?: string
          created_at?: string
          edit_distance?: number | null
          generated_by?:
            | Database["public"]["Enums"]["lead_message_generator"]
            | null
          generated_content?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["lead_message_kind"] | null
          lead_id?: string
          occurred_at?: string
          owner_id?: string
          sender?: Database["public"]["Enums"]["lead_message_sender"]
          style_excluded?: boolean
          variant?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_signals: {
        Row: {
          already_solved: boolean
          business_impact: string | null
          created_at: string
          description: string | null
          evidence: string | null
          id: string
          kind: Database["public"]["Enums"]["lead_signal_kind"]
          lead_id: string
          owner_id: string
          status: Database["public"]["Enums"]["lead_signal_status"]
          timing: string | null
          title: string
          trigger_event: string | null
          updated_at: string
        }
        Insert: {
          already_solved?: boolean
          business_impact?: string | null
          created_at?: string
          description?: string | null
          evidence?: string | null
          id?: string
          kind: Database["public"]["Enums"]["lead_signal_kind"]
          lead_id: string
          owner_id: string
          status?: Database["public"]["Enums"]["lead_signal_status"]
          timing?: string | null
          title: string
          trigger_event?: string | null
          updated_at?: string
        }
        Update: {
          already_solved?: boolean
          business_impact?: string | null
          created_at?: string
          description?: string | null
          evidence?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["lead_signal_kind"]
          lead_id?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["lead_signal_status"]
          timing?: string | null
          title?: string
          trigger_event?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_signals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
          interest_level: number | null
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
          sales_angle: Database["public"]["Enums"]["lead_sales_angle"] | null
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
          interest_level?: number | null
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
          sales_angle?: Database["public"]["Enums"]["lead_sales_angle"] | null
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
          interest_level?: number | null
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
          sales_angle?: Database["public"]["Enums"]["lead_sales_angle"] | null
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
      ops_approvals: {
        Row: {
          agent: string
          channel: Database["public"]["Enums"]["ops_channel"]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: Database["public"]["Enums"]["ops_decision"]
          draft_body: string
          external_id: string
          final_body: string | null
          history: Json
          id: string
          lead_id: string | null
          lead_name: string
          occurred_at: string
          owner_id: string
          reason: string
          updated_at: string
        }
        Insert: {
          agent: string
          channel?: Database["public"]["Enums"]["ops_channel"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["ops_decision"]
          draft_body: string
          external_id: string
          final_body?: string | null
          history?: Json
          id?: string
          lead_id?: string | null
          lead_name: string
          occurred_at?: string
          owner_id: string
          reason?: string
          updated_at?: string
        }
        Update: {
          agent?: string
          channel?: Database["public"]["Enums"]["ops_channel"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["ops_decision"]
          draft_body?: string
          external_id?: string
          final_body?: string | null
          history?: Json
          id?: string
          lead_id?: string | null
          lead_name?: string
          occurred_at?: string
          owner_id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_approvals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_improvements: {
        Row: {
          area: Database["public"]["Enums"]["ops_area"]
          body: string
          created_at: string
          external_id: string
          id: string
          impact: Database["public"]["Enums"]["ops_impact"]
          impact_score: number | null
          owner_id: string
          status: Database["public"]["Enums"]["ops_improvement_status"]
          title: string
          updated_at: string
          week_label: string | null
        }
        Insert: {
          area: Database["public"]["Enums"]["ops_area"]
          body: string
          created_at?: string
          external_id: string
          id?: string
          impact: Database["public"]["Enums"]["ops_impact"]
          impact_score?: number | null
          owner_id: string
          status?: Database["public"]["Enums"]["ops_improvement_status"]
          title: string
          updated_at?: string
          week_label?: string | null
        }
        Update: {
          area?: Database["public"]["Enums"]["ops_area"]
          body?: string
          created_at?: string
          external_id?: string
          id?: string
          impact?: Database["public"]["Enums"]["ops_impact"]
          impact_score?: number | null
          owner_id?: string
          status?: Database["public"]["Enums"]["ops_improvement_status"]
          title?: string
          updated_at?: string
          week_label?: string | null
        }
        Relationships: []
      }
      ops_status: {
        Row: {
          agent: string
          area: Database["public"]["Enums"]["ops_area"]
          created_at: string
          detail: string
          estado: Database["public"]["Enums"]["ops_estado"]
          external_id: string
          id: string
          needs_ok: boolean
          occurred_at: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          agent: string
          area: Database["public"]["Enums"]["ops_area"]
          created_at?: string
          detail?: string
          estado: Database["public"]["Enums"]["ops_estado"]
          external_id: string
          id?: string
          needs_ok?: boolean
          occurred_at?: string
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          agent?: string
          area?: Database["public"]["Enums"]["ops_area"]
          created_at?: string
          detail?: string
          estado?: Database["public"]["Enums"]["ops_estado"]
          external_id?: string
          id?: string
          needs_ok?: boolean
          occurred_at?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alias: string | null
          avatar_url: string | null
          created_at: string
          id: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_goals: {
        Row: {
          avg_ticket: number
          booking_rate: number
          close_rate: number
          created_at: string
          currency: string
          id: string
          monthly_revenue_target: number
          owner_id: string
          show_rate: number
          status: Database["public"]["Enums"]["sales_goal_status"]
          updated_at: string
          working_days_per_month: number
          working_days_per_week: number
        }
        Insert: {
          avg_ticket: number
          booking_rate: number
          close_rate: number
          created_at?: string
          currency?: string
          id?: string
          monthly_revenue_target: number
          owner_id: string
          show_rate: number
          status?: Database["public"]["Enums"]["sales_goal_status"]
          updated_at?: string
          working_days_per_month: number
          working_days_per_week: number
        }
        Update: {
          avg_ticket?: number
          booking_rate?: number
          close_rate?: number
          created_at?: string
          currency?: string
          id?: string
          monthly_revenue_target?: number
          owner_id?: string
          show_rate?: number
          status?: Database["public"]["Enums"]["sales_goal_status"]
          updated_at?: string
          working_days_per_month?: number
          working_days_per_week?: number
        }
        Relationships: []
      }
      sales_knowledge: {
        Row: {
          body: string | null
          collection: Database["public"]["Enums"]["lead_knowledge_collection"]
          created_at: string
          data: Json
          id: string
          lead_id: string | null
          origin: Database["public"]["Enums"]["lead_knowledge_origin"]
          owner_id: string
          search: unknown
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          collection: Database["public"]["Enums"]["lead_knowledge_collection"]
          created_at?: string
          data?: Json
          id?: string
          lead_id?: string | null
          origin: Database["public"]["Enums"]["lead_knowledge_origin"]
          owner_id: string
          search?: unknown
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          collection?: Database["public"]["Enums"]["lead_knowledge_collection"]
          created_at?: string
          data?: Json
          id?: string
          lead_id?: string | null
          origin?: Database["public"]["Enums"]["lead_knowledge_origin"]
          owner_id?: string
          search?: unknown
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_knowledge_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
      team_goals: {
        Row: {
          avg_ticket: number
          booking_rate: number
          close_rate: number
          created_at: string
          currency: string
          id: string
          monthly_revenue_target: number
          owner_id: string
          show_rate: number
          status: Database["public"]["Enums"]["sales_goal_status"]
          team_id: string
          updated_at: string
          working_days_per_month: number
          working_days_per_week: number
        }
        Insert: {
          avg_ticket: number
          booking_rate: number
          close_rate: number
          created_at?: string
          currency?: string
          id?: string
          monthly_revenue_target: number
          owner_id: string
          show_rate: number
          status?: Database["public"]["Enums"]["sales_goal_status"]
          team_id: string
          updated_at?: string
          working_days_per_month: number
          working_days_per_week: number
        }
        Update: {
          avg_ticket?: number
          booking_rate?: number
          close_rate?: number
          created_at?: string
          currency?: string
          id?: string
          monthly_revenue_target?: number
          owner_id?: string
          show_rate?: number
          status?: Database["public"]["Enums"]["sales_goal_status"]
          team_id?: string
          updated_at?: string
          working_days_per_month?: number
          working_days_per_week?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      lead_first_contacts: {
        Row: {
          first_contact_at: string | null
          lead_id: string | null
        }
        Relationships: []
      }
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
      brand_define_goal: {
        Args: {
          p_baseline: number
          p_baseline_date: string
          p_deadline?: string
          p_platform: Database["public"]["Enums"]["brand_platform"]
          p_target: number
        }
        Returns: string
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
      lead_angle_counts_30d: {
        Args: never
        Returns: {
          angle: Database["public"]["Enums"]["lead_sales_angle"]
          message_count: number
        }[]
      }
      lead_angle_variant_performance: {
        Args: never
        Returns: {
          angle: Database["public"]["Enums"]["lead_sales_angle"]
          human_response_rate: number
          meeting_rate: number
          n: number
          qualification_rate: number
          variant: number
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
      leads_daily_contacts: {
        Args: { p_from: string; p_to: string; p_tz?: string }
        Returns: {
          contacts: number
          day: string
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
      leads_execution_metrics: {
        Args: { p_booking_lag_days?: number; p_from: string; p_to: string }
        Returns: {
          booked: number
          booking_cohort: number
          contacts: number
          held_leads: number
          human_responses: number
          meetings_held: number
          meetings_no_show: number
          won_from_held: number
          won_in_window: number
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
          contacted_count: number
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
      leads_prospecting_funnel: {
        Args: never
        Returns: {
          contacts_sent: number
          human_responses: number
          interested: number
          meetings: number
          qualified: number
          total_leads: number
          total_responses: number
          won: number
        }[]
      }
      sales_define_goal: {
        Args: {
          p_booking_rate: number
          p_close_rate: number
          p_days_per_month: number
          p_days_per_week: number
          p_revenue: number
          p_show_rate: number
          p_ticket: number
        }
        Returns: string
      }
      team_can_see: { Args: { p_owner: string }; Returns: boolean }
      team_daily_contacts: {
        Args: { p_from: string; p_owner: string; p_to: string; p_tz?: string }
        Returns: {
          day: string
          first_contacts: number
          followups: number
        }[]
      }
      team_define_goal: {
        Args: {
          p_booking_rate: number
          p_close_rate: number
          p_days_per_month: number
          p_days_per_week: number
          p_revenue: number
          p_show_rate: number
          p_ticket: number
        }
        Returns: string
      }
      team_directory: {
        Args: never
        Returns: {
          avatar_url: string
          name: string
          owner_id: string
        }[]
      }
      team_appointments: {
        Args: {
          p_from?: string
          p_limit?: number
          p_list?: boolean
          p_to?: string
        }
        Returns: {
          created_at: string
          ends_at: string
          id: string
          lead_id: string | null
          lead_name: string | null
          lead_status: Database["public"]["Enums"]["lead_status"] | null
          meeting_url: string | null
          notes: string | null
          owner_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          title: string
          updated_at: string
        }[]
      }
      team_execution_metrics: {
        Args: {
          p_booking_lag_days?: number
          p_from: string
          p_owner: string
          p_to: string
        }
        Returns: {
          booked: number
          booking_cohort: number
          contacts: number
          held_leads: number
          human_responses: number
          meetings_held: number
          meetings_no_show: number
          won_from_held: number
          won_in_window: number
        }[]
      }
      team_prospecting_funnel: {
        Args: { p_owner: string }
        Returns: {
          contacts_sent: number
          human_responses: number
          interested: number
          meetings: number
          qualified: number
          total_leads: number
          total_responses: number
          won: number
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
      brand_goal_status: "ACTIVA" | "CUMPLIDA" | "ARCHIVADA"
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
      lead_knowledge_collection:
        | "OBJECIONES"
        | "DOLORES"
        | "ANGULOS"
        | "SEGMENTOS"
        | "MENSAJES"
        | "APRENDIZAJES"
      lead_knowledge_origin: "PROPIO" | "MERCADO" | "HIPOTESIS"
      lead_message_generator: "IA" | "HUMANO"
      lead_message_kind: "APERTURA" | "RESPUESTA" | "SEGUIMIENTO"
      lead_message_sender: "VENDEDOR" | "LEAD"
      lead_next_action:
        | "ASK_QUESTION"
        | "EXPLAIN_SERVICE"
        | "ASK_FOR_MEETING"
        | "SEND_INFORMATION"
        | "FOLLOW_UP"
        | "WAIT"
        | "DISQUALIFY"
        | "CLOSE_LEAD"
      lead_sales_angle:
        | "FOLLOWUP"
        | "BOOKING"
        | "NOSHOW"
        | "REBOOKING"
        | "REACTIVATION"
        | "RESPONSE_TIME"
        | "OPERATIONS"
        | "CRM"
        | "REVIEWS"
      lead_signal_kind: "DOLOR" | "OBJECION" | "SENAL_COMPRA"
      lead_signal_status: "HIPOTESIS" | "SOSPECHADO" | "CONFIRMADO"
      lead_source: "GOOGLE_MAPS" | "INSTAGRAM" | "LINKEDIN" | "CSV" | "MANUAL"
      lead_status:
        | "NUEVO"
        | "LISTO"
        | "CONTACTADO"
        | "AUTORESPUESTA"
        | "RESPONDIO"
        | "DIAGNOSTICO"
        | "CALIFICADO"
        | "INTERESADO"
        | "REUNION_PROPUESTA"
        | "REUNION_AGENDADA"
        | "REUNION_REALIZADA"
        | "PROPUESTA_ENVIADA"
        | "CERRADO_GANADO"
        | "AHORA_NO"
        | "SEGUIMIENTO"
        | "CERRADO_PERDIDO"
        | "DESCARTADO"
      message_channel: "WHATSAPP" | "EMAIL" | "INSTAGRAM"
      ops_area:
        | "prospeccion"
        | "ventas"
        | "instagram"
        | "youtube"
        | "operaciones"
        | "auditor"
      ops_channel: "whatsapp" | "email" | "instagram"
      ops_decision: "pending" | "approved" | "edited" | "skipped"
      ops_estado: "hecho" | "pendiente" | "bloqueo"
      ops_impact: "alto" | "medio" | "bajo"
      ops_improvement_status: "abierta" | "aplicada" | "descartada"
      sales_goal_status: "ACTIVA" | "ARCHIVADA"
      trend_source: "APIFY" | "META"
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
      brand_goal_status: ["ACTIVA", "CUMPLIDA", "ARCHIVADA"],
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
      lead_knowledge_collection: [
        "OBJECIONES",
        "DOLORES",
        "ANGULOS",
        "SEGMENTOS",
        "MENSAJES",
        "APRENDIZAJES",
      ],
      lead_knowledge_origin: ["PROPIO", "MERCADO", "HIPOTESIS"],
      lead_message_generator: ["IA", "HUMANO"],
      lead_message_kind: ["APERTURA", "RESPUESTA", "SEGUIMIENTO"],
      lead_message_sender: ["VENDEDOR", "LEAD"],
      lead_next_action: [
        "ASK_QUESTION",
        "EXPLAIN_SERVICE",
        "ASK_FOR_MEETING",
        "SEND_INFORMATION",
        "FOLLOW_UP",
        "WAIT",
        "DISQUALIFY",
        "CLOSE_LEAD",
      ],
      lead_sales_angle: [
        "FOLLOWUP",
        "BOOKING",
        "NOSHOW",
        "REBOOKING",
        "REACTIVATION",
        "RESPONSE_TIME",
        "OPERATIONS",
        "CRM",
        "REVIEWS",
      ],
      lead_signal_kind: ["DOLOR", "OBJECION", "SENAL_COMPRA"],
      lead_signal_status: ["HIPOTESIS", "SOSPECHADO", "CONFIRMADO"],
      lead_source: ["GOOGLE_MAPS", "INSTAGRAM", "LINKEDIN", "CSV", "MANUAL"],
      lead_status: [
        "NUEVO",
        "LISTO",
        "CONTACTADO",
        "AUTORESPUESTA",
        "RESPONDIO",
        "DIAGNOSTICO",
        "CALIFICADO",
        "INTERESADO",
        "REUNION_PROPUESTA",
        "REUNION_AGENDADA",
        "REUNION_REALIZADA",
        "PROPUESTA_ENVIADA",
        "CERRADO_GANADO",
        "AHORA_NO",
        "SEGUIMIENTO",
        "CERRADO_PERDIDO",
        "DESCARTADO",
      ],
      message_channel: ["WHATSAPP", "EMAIL", "INSTAGRAM"],
      ops_area: [
        "prospeccion",
        "ventas",
        "instagram",
        "youtube",
        "operaciones",
        "auditor",
      ],
      ops_channel: ["whatsapp", "email", "instagram"],
      ops_decision: ["pending", "approved", "edited", "skipped"],
      ops_estado: ["hecho", "pendiente", "bloqueo"],
      ops_impact: ["alto", "medio", "bajo"],
      ops_improvement_status: ["abierta", "aplicada", "descartada"],
      sales_goal_status: ["ACTIVA", "ARCHIVADA"],
      trend_source: ["APIFY", "META"],
    },
  },
} as const
