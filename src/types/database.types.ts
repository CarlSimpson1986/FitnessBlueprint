// Hand-written to exactly match supabase/migrations/0001-0003.
// Docker wasn't available locally to run `supabase gen types` (which shells
// out to a container for introspection), so this was built directly from
// the migration SQL instead of the live database. If Docker becomes
// available later, regenerate with:
//   npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > src/types/database.types.ts
// That CLI output also fills in `Relationships` metadata (used for typed
// nested `.select('*, other_table(*)')` embeds), which is left as `[]` here.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: Database['public']['Enums']['member_role']
          coach_access_level: Database['public']['Enums']['coach_access_level'] | null
          full_name: string
          email: string
          phone: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: Database['public']['Enums']['member_role']
          coach_access_level?: Database['public']['Enums']['coach_access_level'] | null
          full_name: string
          email: string
          phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: Database['public']['Enums']['member_role']
          coach_access_level?: Database['public']['Enums']['coach_access_level'] | null
          full_name?: string
          email?: string
          phone?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      membership_plans: {
        Row: {
          id: string
          code: string
          name: string
          price_pence: number
          billing_type: string
          sessions_per_week: number | null
          credit_pack_size: number | null
          programme_length_days: number | null
          is_active: boolean
        }
        Insert: {
          id?: string
          code: string
          name: string
          price_pence: number
          billing_type: string
          sessions_per_week?: number | null
          credit_pack_size?: number | null
          programme_length_days?: number | null
          is_active?: boolean
        }
        Update: {
          id?: string
          code?: string
          name?: string
          price_pence?: number
          billing_type?: string
          sessions_per_week?: number | null
          credit_pack_size?: number | null
          programme_length_days?: number | null
          is_active?: boolean
        }
        Relationships: []
      }
      member_memberships: {
        Row: {
          id: string
          member_id: string
          plan_id: string
          status: Database['public']['Enums']['membership_status']
          started_at: string
          current_period_end: string | null
          stripe_subscription_id: string | null
          gocardless_subscription_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          member_id: string
          plan_id: string
          status?: Database['public']['Enums']['membership_status']
          started_at?: string
          current_period_end?: string | null
          stripe_subscription_id?: string | null
          gocardless_subscription_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          plan_id?: string
          status?: Database['public']['Enums']['membership_status']
          started_at?: string
          current_period_end?: string | null
          stripe_subscription_id?: string | null
          gocardless_subscription_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          id: string
          member_id: string
          delta: number
          reason: string
          related_booking_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          member_id: string
          delta: number
          reason: string
          related_booking_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          delta?: number
          reason?: string
          related_booking_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      session_templates: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          default_duration_minutes: number
          default_capacity: number
          is_active: boolean
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          default_duration_minutes?: number
          default_capacity?: number
          is_active?: boolean
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          default_duration_minutes?: number
          default_capacity?: number
          is_active?: boolean
        }
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          template_id: string
          coach_id: string
          session_date: string
          start_time: string
          duration_minutes: number
          capacity: number
          status: Database['public']['Enums']['session_status']
          created_at: string
        }
        Insert: {
          id?: string
          template_id: string
          coach_id: string
          session_date: string
          start_time: string
          duration_minutes: number
          capacity: number
          status?: Database['public']['Enums']['session_status']
          created_at?: string
        }
        Update: {
          id?: string
          template_id?: string
          coach_id?: string
          session_date?: string
          start_time?: string
          duration_minutes?: number
          capacity?: number
          status?: Database['public']['Enums']['session_status']
          created_at?: string
        }
        Relationships: []
      }
      session_plans: {
        Row: {
          id: string
          session_id: string
          block_id: string | null
          plan_text: string
          is_published: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          block_id?: string | null
          plan_text: string
          is_published?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          block_id?: string | null
          plan_text?: string
          is_published?: boolean
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          session_id: string
          member_id: string
          status: Database['public']['Enums']['booking_status']
          booked_at: string
          cancelled_at: string | null
          credit_ledger_id: string | null
        }
        Insert: {
          id?: string
          session_id: string
          member_id: string
          status?: Database['public']['Enums']['booking_status']
          booked_at?: string
          cancelled_at?: string | null
          credit_ledger_id?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          member_id?: string
          status?: Database['public']['Enums']['booking_status']
          booked_at?: string
          cancelled_at?: string | null
          credit_ledger_id?: string | null
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          id: string
          session_id: string
          member_id: string
          buddy_member_id: string | null
          position: number
          status: Database['public']['Enums']['waitlist_status']
          offered_at: string | null
          offer_expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          member_id: string
          buddy_member_id?: string | null
          position: number
          status?: Database['public']['Enums']['waitlist_status']
          offered_at?: string | null
          offer_expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          member_id?: string
          buddy_member_id?: string | null
          position?: number
          status?: Database['public']['Enums']['waitlist_status']
          offered_at?: string | null
          offer_expires_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      readiness_checkins: {
        Row: {
          id: string
          member_id: string
          session_id: string
          feeling: string
          pain_area: string | null
          sleep_quality: string | null
          submitted_at: string
        }
        Insert: {
          id?: string
          member_id: string
          session_id: string
          feeling: string
          pain_area?: string | null
          sleep_quality?: string | null
          submitted_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          session_id?: string
          feeling?: string
          pain_area?: string | null
          sleep_quality?: string | null
          submitted_at?: string
        }
        Relationships: []
      }
      session_notes: {
        Row: {
          id: string
          session_id: string
          member_id: string
          coach_id: string
          tags: string[]
          note_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          member_id: string
          coach_id: string
          tags?: string[]
          note_text?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          member_id?: string
          coach_id?: string
          tags?: string[]
          note_text?: string | null
          created_at?: string
        }
        Relationships: []
      }
      session_feedback: {
        Row: {
          id: string
          session_id: string
          member_id: string
          class_rating: number
          effort_rating: number
          experience_rating: number
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          member_id: string
          class_rating: number
          effort_rating: number
          experience_rating: number
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          member_id?: string
          class_rating?: number
          effort_rating?: number
          experience_rating?: number
          comment?: string | null
          created_at?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          id: string
          title: string
          description: string | null
          type: Database['public']['Enums']['challenge_type']
          is_open: boolean
          target_value: number
          starts_at: string
          ends_at: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          type: Database['public']['Enums']['challenge_type']
          is_open?: boolean
          target_value: number
          starts_at: string
          ends_at: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          type?: Database['public']['Enums']['challenge_type']
          is_open?: boolean
          target_value?: number
          starts_at?: string
          ends_at?: string
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      challenge_participants: {
        Row: {
          id: string
          challenge_id: string
          member_id: string
          progress_value: number
          joined_at: string
        }
        Insert: {
          id?: string
          challenge_id: string
          member_id: string
          progress_value?: number
          joined_at?: string
        }
        Update: {
          id?: string
          challenge_id?: string
          member_id?: string
          progress_value?: number
          joined_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          title: string
          description: string | null
          event_type: Database['public']['Enums']['event_type']
          event_date: string | null
          location: string | null
          registration_url: string | null
          is_paid: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          event_type: Database['public']['Enums']['event_type']
          event_date?: string | null
          location?: string | null
          registration_url?: string | null
          is_paid?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          event_type?: Database['public']['Enums']['event_type']
          event_date?: string | null
          location?: string | null
          registration_url?: string | null
          is_paid?: boolean
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      event_interests: {
        Row: {
          id: string
          event_id: string
          member_id: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          member_id: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          member_id?: string
          created_at?: string
        }
        Relationships: []
      }
      coach_ted_knowledge_base: {
        Row: {
          id: string
          category: string
          content: string
          embedding: number[] | null
          created_by: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category: string
          content: string
          embedding?: number[] | null
          created_by: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category?: string
          content?: string
          embedding?: number[] | null
          created_by?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      coach_ted_qa_cache: {
        Row: {
          id: string
          question: string
          question_embedding: number[] | null
          answer: string
          sources: Json
          hit_count: number
          is_pinned: boolean
          is_flagged: boolean
          created_at: string
          last_served_at: string | null
        }
        Insert: {
          id?: string
          question: string
          question_embedding?: number[] | null
          answer: string
          sources?: Json
          hit_count?: number
          is_pinned?: boolean
          is_flagged?: boolean
          created_at?: string
          last_served_at?: string | null
        }
        Update: {
          id?: string
          question?: string
          question_embedding?: number[] | null
          answer?: string
          sources?: Json
          hit_count?: number
          is_pinned?: boolean
          is_flagged?: boolean
          created_at?: string
          last_served_at?: string | null
        }
        Relationships: []
      }
      coach_ted_conversations: {
        Row: {
          id: string
          member_id: string
          question: string
          answer: string
          matched_qa_cache_id: string | null
          was_served_from_cache: boolean
          created_at: string
        }
        Insert: {
          id?: string
          member_id: string
          question: string
          answer: string
          matched_qa_cache_id?: string | null
          was_served_from_cache?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          question?: string
          answer?: string
          matched_qa_cache_id?: string | null
          was_served_from_cache?: boolean
          created_at?: string
        }
        Relationships: []
      }
      habit_definitions: {
        Row: {
          id: string
          name: string
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      habit_logs: {
        Row: {
          id: string
          member_id: string
          habit_id: string
          log_date: string
          completed_at: string
        }
        Insert: {
          id?: string
          member_id: string
          habit_id: string
          log_date: string
          completed_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          habit_id?: string
          log_date?: string
          completed_at?: string
        }
        Relationships: []
      }
      weigh_ins: {
        Row: {
          id: string
          member_id: string
          weight_kg: number
          recorded_at: string
        }
        Insert: {
          id?: string
          member_id: string
          weight_kg: number
          recorded_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          weight_kg?: number
          recorded_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_session: {
        Args: {
          p_session_id: string
        }
        Returns: {
          id: string
          session_id: string
          member_id: string
          status: Database['public']['Enums']['booking_status']
          booked_at: string
          cancelled_at: string | null
          credit_ledger_id: string | null
        }
      }
      cancel_booking: {
        Args: {
          p_booking_id: string
        }
        Returns: {
          id: string
          session_id: string
          member_id: string
          status: Database['public']['Enums']['booking_status']
          booked_at: string
          cancelled_at: string | null
          credit_ledger_id: string | null
        }
      }
      session_spots_taken: {
        Args: {
          p_session_ids: string[]
        }
        Returns: {
          session_id: string
          spots_taken: number
        }[]
      }
      join_waitlist: {
        Args: {
          p_session_id: string
          p_buddy_member_id?: string | null
        }
        Returns: {
          id: string
          session_id: string
          member_id: string
          buddy_member_id: string | null
          position: number
          status: Database['public']['Enums']['waitlist_status']
          offered_at: string | null
          offer_expires_at: string | null
          created_at: string
        }
      }
      leave_waitlist: {
        Args: {
          p_entry_id: string
        }
        Returns: {
          id: string
          session_id: string
          member_id: string
          buddy_member_id: string | null
          position: number
          status: Database['public']['Enums']['waitlist_status']
          offered_at: string | null
          offer_expires_at: string | null
          created_at: string
        }
      }
      accept_waitlist_offer: {
        Args: {
          p_entry_id: string
        }
        Returns: {
          id: string
          session_id: string
          member_id: string
          status: Database['public']['Enums']['booking_status']
          booked_at: string
          cancelled_at: string | null
          credit_ledger_id: string | null
        }
      }
      lookup_member_by_email: {
        Args: {
          p_email: string
        }
        Returns: {
          id: string
          full_name: string
        }[]
      }
      list_coach_names: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          full_name: string
        }[]
      }
      match_qa_cache: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
        }
        Returns: {
          id: string
          question: string
          answer: string
          sources: Json
          similarity: number
        }[]
      }
      match_knowledge_base: {
        Args: {
          query_embedding: number[]
          match_count?: number
        }
        Returns: {
          id: string
          category: string
          content: string
          similarity: number
        }[]
      }
    }
    Enums: {
      member_role: 'member' | 'coach' | 'owner'
      coach_access_level: 'full' | 'cover_and_kids_only'
      membership_status: 'active' | 'paused' | 'cancelled' | 'expired'
      session_status: 'scheduled' | 'cancelled' | 'completed'
      booking_status: 'booked' | 'cancelled' | 'attended' | 'no_show' | 'excused'
      waitlist_status: 'waiting' | 'offered' | 'accepted' | 'expired' | 'declined'
      challenge_type: 'attendance' | 'habit' | 'event_prep' | 'team'
      event_type: 'gym' | 'member_posted'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['public']

export type Tables<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
  ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends keyof PublicSchema['Enums'] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
  ? PublicSchema['Enums'][PublicEnumNameOrOptions]
  : never
