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
      adverse_actions: {
        Row: {
          applicant_id: string
          created_at: string
          created_by: string
          final_notice_sent_at: string | null
          id: string
          org_id: string
          pre_notice_sent_at: string | null
          reason: string | null
          report_copy_provided: boolean
          report_copy_provided_at: string | null
          status: string
          store_id: string | null
          updated_at: string
          waiting_period_ends_at: string | null
        }
        Insert: {
          applicant_id: string
          created_at?: string
          created_by: string
          final_notice_sent_at?: string | null
          id?: string
          org_id: string
          pre_notice_sent_at?: string | null
          reason?: string | null
          report_copy_provided?: boolean
          report_copy_provided_at?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          waiting_period_ends_at?: string | null
        }
        Update: {
          applicant_id?: string
          created_at?: string
          created_by?: string
          final_notice_sent_at?: string | null
          id?: string
          org_id?: string
          pre_notice_sent_at?: string | null
          reason?: string | null
          report_copy_provided?: boolean
          report_copy_provided_at?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          waiting_period_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adverse_actions_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adverse_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adverse_actions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          reconnect_required: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      applicant_consents: {
        Row: {
          applicant_id: string
          consent_text: string
          consent_type: string
          consent_version: string
          created_by: string | null
          granted: boolean
          granted_at: string
          id: string
          ip_address: string | null
          org_id: string
          revoked_at: string | null
          revoked_source: string | null
          source: string
          store_id: string | null
          user_agent: string | null
        }
        Insert: {
          applicant_id: string
          consent_text: string
          consent_type: string
          consent_version?: string
          created_by?: string | null
          granted: boolean
          granted_at?: string
          id?: string
          ip_address?: string | null
          org_id: string
          revoked_at?: string | null
          revoked_source?: string | null
          source?: string
          store_id?: string | null
          user_agent?: string | null
        }
        Update: {
          applicant_id?: string
          consent_text?: string
          consent_type?: string
          consent_version?: string
          created_by?: string | null
          granted?: boolean
          granted_at?: string
          id?: string
          ip_address?: string | null
          org_id?: string
          revoked_at?: string | null
          revoked_source?: string | null
          source?: string
          store_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applicant_consents_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_consents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_consents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      application_events: {
        Row: {
          actor_id: string | null
          application_id: string
          created_at: string
          id: string
          kind: string
          message: string
          org_id: string
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          created_at?: string
          id?: string
          kind: string
          message: string
          org_id: string
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          created_at?: string
          id?: string
          kind?: string
          message?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          ai_paused_at: string | null
          ai_summary: string | null
          answers: Json
          archived_at: string | null
          background_check_note: string | null
          background_check_status: string | null
          background_check_updated_at: string | null
          candidate_id: string | null
          created_at: string
          created_by: string | null
          created_manually: boolean
          dealership_id: string
          departed_at: string | null
          departure_reason: string | null
          email: string
          email_norm: string | null
          full_name: string
          hired_at: string | null
          id: string
          in_talent_pool: boolean
          job_id: string
          knockout_failed: boolean
          last_reminded_at: string | null
          linkedin_url: string | null
          merged_into_id: string | null
          moved_to_pool_at: string | null
          needs_attention: string | null
          notes: string | null
          open_to_other_stores: boolean
          org_id: string
          original_store_id: string | null
          phone: string | null
          phone_norm: string | null
          pool_reason: string | null
          profile: Json
          rating: number | null
          recruiting_event_id: string | null
          referral_source: string | null
          referred_by_text: string | null
          referrer_id: string | null
          reminder_count: number
          resume_file_name: string | null
          resume_path: string | null
          resume_url: string | null
          source: string
          source_channel: string
          source_detail: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["application_status"]
          status_changed_at: string
          status_token: string
          talent_pool_region_id: string | null
          updated_at: string
        }
        Insert: {
          ai_paused_at?: string | null
          ai_summary?: string | null
          answers?: Json
          archived_at?: string | null
          background_check_note?: string | null
          background_check_status?: string | null
          background_check_updated_at?: string | null
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          created_manually?: boolean
          dealership_id: string
          departed_at?: string | null
          departure_reason?: string | null
          email: string
          email_norm?: string | null
          full_name: string
          hired_at?: string | null
          id?: string
          in_talent_pool?: boolean
          job_id: string
          knockout_failed?: boolean
          last_reminded_at?: string | null
          linkedin_url?: string | null
          merged_into_id?: string | null
          moved_to_pool_at?: string | null
          needs_attention?: string | null
          notes?: string | null
          open_to_other_stores?: boolean
          org_id: string
          original_store_id?: string | null
          phone?: string | null
          phone_norm?: string | null
          pool_reason?: string | null
          profile?: Json
          rating?: number | null
          recruiting_event_id?: string | null
          referral_source?: string | null
          referred_by_text?: string | null
          referrer_id?: string | null
          reminder_count?: number
          resume_file_name?: string | null
          resume_path?: string | null
          resume_url?: string | null
          source?: string
          source_channel?: string
          source_detail?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          status_changed_at?: string
          status_token?: string
          talent_pool_region_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_paused_at?: string | null
          ai_summary?: string | null
          answers?: Json
          archived_at?: string | null
          background_check_note?: string | null
          background_check_status?: string | null
          background_check_updated_at?: string | null
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          created_manually?: boolean
          dealership_id?: string
          departed_at?: string | null
          departure_reason?: string | null
          email?: string
          email_norm?: string | null
          full_name?: string
          hired_at?: string | null
          id?: string
          in_talent_pool?: boolean
          job_id?: string
          knockout_failed?: boolean
          last_reminded_at?: string | null
          linkedin_url?: string | null
          merged_into_id?: string | null
          moved_to_pool_at?: string | null
          needs_attention?: string | null
          notes?: string | null
          open_to_other_stores?: boolean
          org_id?: string
          original_store_id?: string | null
          phone?: string | null
          phone_norm?: string | null
          pool_reason?: string | null
          profile?: Json
          rating?: number | null
          recruiting_event_id?: string | null
          referral_source?: string | null
          referred_by_text?: string | null
          referrer_id?: string | null
          reminder_count?: number
          resume_file_name?: string | null
          resume_path?: string | null
          resume_url?: string | null
          source?: string
          source_channel?: string
          source_detail?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          status_changed_at?: string
          status_token?: string
          talent_pool_region_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_original_store_id_fkey"
            columns: ["original_store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_recruiting_event_id_fkey"
            columns: ["recruiting_event_id"]
            isOneToOne: false
            referencedRelation: "recruiting_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_talent_pool_region_id_fkey"
            columns: ["talent_pool_region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_sends: {
        Row: {
          batch_id: string
          body: string
          channel: string
          created_at: string
          email_demo: boolean
          id: string
          is_demo: boolean
          org_id: string
          queued_count: number
          selected_count: number
          sender_id: string
          sent_at: string | null
          sent_count: number
          skipped_count: number
          skipped_reasons: Json
          store_id: string
          subject: string | null
          text_demo: boolean
        }
        Insert: {
          batch_id: string
          body: string
          channel: string
          created_at?: string
          email_demo?: boolean
          id?: string
          is_demo?: boolean
          org_id: string
          queued_count?: number
          selected_count?: number
          sender_id: string
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          skipped_reasons?: Json
          store_id: string
          subject?: string | null
          text_demo?: boolean
        }
        Update: {
          batch_id?: string
          body?: string
          channel?: string
          created_at?: string
          email_demo?: boolean
          id?: string
          is_demo?: boolean
          org_id?: string
          queued_count?: number
          selected_count?: number
          sender_id?: string
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          skipped_reasons?: Json
          store_id?: string
          subject?: string | null
          text_demo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bulk_sends_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_sends_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          city: string | null
          consent_source: string | null
          created_at: string
          email: string | null
          email_opted_out_at: string | null
          full_name: string
          id: string
          org_id: string
          phone: string | null
          sms_opt_in: boolean
          sms_opt_in_at: string | null
          sms_opted_out_at: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          consent_source?: string | null
          created_at?: string
          email?: string | null
          email_opted_out_at?: string | null
          full_name: string
          id?: string
          org_id: string
          phone?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          sms_opted_out_at?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          consent_source?: string | null
          created_at?: string
          email?: string | null
          email_opted_out_at?: string | null
          full_name?: string
          id?: string
          org_id?: string
          phone?: string | null
          sms_opt_in?: boolean
          sms_opt_in_at?: string | null
          sms_opted_out_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dealerships: {
        Row: {
          address: string | null
          assistant_name: string
          brand: string | null
          city: string | null
          created_at: string
          escalation_name: string | null
          escalation_phone: string | null
          id: string
          interview_hours: Json
          interview_minutes: number
          manager_name: string | null
          manager_phone: string | null
          name: string
          org_id: string
          qr_code: string
          region_id: string | null
          sms_number: string | null
          state: string | null
          timezone: string
        }
        Insert: {
          address?: string | null
          assistant_name?: string
          brand?: string | null
          city?: string | null
          created_at?: string
          escalation_name?: string | null
          escalation_phone?: string | null
          id?: string
          interview_hours?: Json
          interview_minutes?: number
          manager_name?: string | null
          manager_phone?: string | null
          name: string
          org_id: string
          qr_code?: string
          region_id?: string | null
          sms_number?: string | null
          state?: string | null
          timezone?: string
        }
        Update: {
          address?: string | null
          assistant_name?: string
          brand?: string | null
          city?: string | null
          created_at?: string
          escalation_name?: string | null
          escalation_phone?: string | null
          id?: string
          interview_hours?: Json
          interview_minutes?: number
          manager_name?: string | null
          manager_phone?: string | null
          name?: string
          org_id?: string
          qr_code?: string
          region_id?: string | null
          sms_number?: string | null
          state?: string | null
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealerships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealerships_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          queued_count: number
          recipient_count: number
          skipped_count: number
          subject: string
          template_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          queued_count?: number
          recipient_count?: number
          skipped_count?: number
          subject: string
          template_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          queued_count?: number
          recipient_count?: number
          skipped_count?: number
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_opt_outs: {
        Row: {
          email: string
          id: string
          opted_out_at: string
          org_id: string
          source: string | null
        }
        Insert: {
          email: string
          id?: string
          opted_out_at?: string
          org_id: string
          source?: string | null
        }
        Update: {
          email?: string
          id?: string
          opted_out_at?: string
          org_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_opt_outs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_kits: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          questions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          questions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          questions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_kits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_recordings: {
        Row: {
          ai_suggestions: Json
          applicant_id: string
          attempts: number
          audio_delete_after: string
          audio_deleted_at: string | null
          capture_method: string
          consent_id: string
          created_at: string
          created_by: string
          duration: number
          error: string | null
          error_status: number | null
          format: string
          id: string
          interview_id: string
          org_id: string
          processing_run_id: string | null
          processing_started_at: string | null
          retention_days: number
          status: string
          storage_path: string | null
          store_id: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          ai_suggestions?: Json
          applicant_id: string
          attempts?: number
          audio_delete_after?: string
          audio_deleted_at?: string | null
          capture_method: string
          consent_id: string
          created_at?: string
          created_by: string
          duration?: number
          error?: string | null
          error_status?: number | null
          format: string
          id?: string
          interview_id: string
          org_id: string
          processing_run_id?: string | null
          processing_started_at?: string | null
          retention_days?: number
          status?: string
          storage_path?: string | null
          store_id: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          ai_suggestions?: Json
          applicant_id?: string
          attempts?: number
          audio_delete_after?: string
          audio_deleted_at?: string | null
          capture_method?: string
          consent_id?: string
          created_at?: string
          created_by?: string
          duration?: number
          error?: string | null
          error_status?: number | null
          format?: string
          id?: string
          interview_id?: string
          org_id?: string
          processing_run_id?: string | null
          processing_started_at?: string | null
          retention_days?: number
          status?: string
          storage_path?: string | null
          store_id?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_recordings_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_recordings_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: true
            referencedRelation: "applicant_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_recordings_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_recordings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_recordings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_scorecards: {
        Row: {
          answers: Json
          application_id: string
          author_id: string
          author_name: string | null
          created_at: string
          id: string
          interview_id: string
          kit_id: string | null
          notes: string | null
          org_id: string
          recommendation: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          application_id: string
          author_id?: string
          author_name?: string | null
          created_at?: string
          id?: string
          interview_id: string
          kit_id?: string | null
          notes?: string | null
          org_id: string
          recommendation?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          application_id?: string
          author_id?: string
          author_name?: string | null
          created_at?: string
          id?: string
          interview_id?: string
          kit_id?: string | null
          notes?: string | null
          org_id?: string
          recommendation?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_scorecards_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_scorecards_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_scorecards_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "interview_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_scorecards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          duration_min: number
          external_event_id: string | null
          id: string
          location: string | null
          org_id: string
          source: string
          starts_at: string
          status: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          duration_min?: number
          external_event_id?: string | null
          id?: string
          location?: string | null
          org_id: string
          source?: string
          starts_at: string
          status?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          duration_min?: number
          external_event_id?: string | null
          id?: string
          location?: string | null
          org_id?: string
          source?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_templates: {
        Row: {
          created_at: string
          department: string | null
          description: string
          division: string
          employment_type: string
          id: string
          org_id: string
          pay_max: number | null
          pay_min: number | null
          pay_period: string
          title: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          description?: string
          division?: string
          employment_type?: string
          id?: string
          org_id: string
          pay_max?: number | null
          pay_min?: number | null
          pay_period?: string
          title: string
        }
        Update: {
          created_at?: string
          department?: string | null
          description?: string
          division?: string
          employment_type?: string
          id?: string
          org_id?: string
          pay_max?: number | null
          pay_min?: number | null
          pay_period?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          dealership_id: string
          department: string | null
          description: string
          division: string
          employment_type: string
          escalation_name: string | null
          escalation_phone: string | null
          hiring_manager: string | null
          hiring_manager_phone: string | null
          id: string
          interview_kit_id: string | null
          org_id: string
          pay_max: number | null
          pay_min: number | null
          pay_period: string
          questions: Json
          referral_tier_id: string | null
          req_type: string
          requested_by: string | null
          status: string
          target_start_date: string | null
          title: string
        }
        Insert: {
          created_at?: string
          dealership_id: string
          department?: string | null
          description?: string
          division?: string
          employment_type?: string
          escalation_name?: string | null
          escalation_phone?: string | null
          hiring_manager?: string | null
          hiring_manager_phone?: string | null
          id?: string
          interview_kit_id?: string | null
          org_id: string
          pay_max?: number | null
          pay_min?: number | null
          pay_period?: string
          questions?: Json
          referral_tier_id?: string | null
          req_type?: string
          requested_by?: string | null
          status?: string
          target_start_date?: string | null
          title: string
        }
        Update: {
          created_at?: string
          dealership_id?: string
          department?: string | null
          description?: string
          division?: string
          employment_type?: string
          escalation_name?: string | null
          escalation_phone?: string | null
          hiring_manager?: string | null
          hiring_manager_phone?: string | null
          id?: string
          interview_kit_id?: string | null
          org_id?: string
          pay_max?: number | null
          pay_min?: number | null
          pay_period?: string
          questions?: Json
          referral_tier_id?: string | null
          req_type?: string
          requested_by?: string | null
          status?: string
          target_start_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_interview_kit_id_fkey"
            columns: ["interview_kit_id"]
            isOneToOne: false
            referencedRelation: "interview_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_referral_tier_id_fkey"
            columns: ["referral_tier_id"]
            isOneToOne: false
            referencedRelation: "referral_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          application_id: string
          body: string
          bulk_send_id: string | null
          campaign_id: string | null
          channel: string
          created_at: string
          direction: string
          error: string | null
          from_email: string | null
          from_phone: string | null
          id: string
          org_id: string
          party: string
          provider: string | null
          provider_message_id: string | null
          purpose: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string | null
          to_email: string | null
          to_phone: string | null
        }
        Insert: {
          application_id: string
          body: string
          bulk_send_id?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          direction: string
          error?: string | null
          from_email?: string | null
          from_phone?: string | null
          id?: string
          org_id: string
          party: string
          provider?: string | null
          provider_message_id?: string | null
          purpose?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          to_phone?: string | null
        }
        Update: {
          application_id?: string
          body?: string
          bulk_send_id?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          direction?: string
          error?: string | null
          from_email?: string | null
          from_phone?: string | null
          id?: string
          org_id?: string
          party?: string
          provider?: string | null
          provider_message_id?: string | null
          purpose?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          to_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_bulk_send_id_fkey"
            columns: ["bulk_send_id"]
            isOneToOne: false
            referencedRelation: "bulk_sends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_settings: {
        Row: {
          ai_provider: string
          automations: Json
          bulk_messaging_enabled: boolean
          email_from_address: string | null
          email_from_name: string | null
          email_mode: string
          email_reply_to: string | null
          escalate_after_hours: number
          hire_on_offer_signed: boolean
          interview_recording_enabled: boolean
          mode: string
          nudge_after_hours: number
          offer_template_id: string | null
          org_id: string
          recording_ai_paused_reason: string | null
          recording_retention_days: number
          send_days: number[]
          send_end: string
          send_start: string
          talent_pool_after_reminders: number
          talent_pool_enabled: boolean
          updated_at: string | null
        }
        Insert: {
          ai_provider?: string
          automations?: Json
          bulk_messaging_enabled?: boolean
          email_from_address?: string | null
          email_from_name?: string | null
          email_mode?: string
          email_reply_to?: string | null
          escalate_after_hours?: number
          hire_on_offer_signed?: boolean
          interview_recording_enabled?: boolean
          mode?: string
          nudge_after_hours?: number
          offer_template_id?: string | null
          org_id: string
          recording_ai_paused_reason?: string | null
          recording_retention_days?: number
          send_days?: number[]
          send_end?: string
          send_start?: string
          talent_pool_after_reminders?: number
          talent_pool_enabled?: boolean
          updated_at?: string | null
        }
        Update: {
          ai_provider?: string
          automations?: Json
          bulk_messaging_enabled?: boolean
          email_from_address?: string | null
          email_from_name?: string | null
          email_mode?: string
          email_reply_to?: string | null
          escalate_after_hours?: number
          hire_on_offer_signed?: boolean
          interview_recording_enabled?: boolean
          mode?: string
          nudge_after_hours?: number
          offer_template_id?: string | null
          org_id?: string
          recording_ai_paused_reason?: string | null
          recording_retention_days?: number
          send_days?: number[]
          send_end?: string
          send_start?: string
          talent_pool_after_reminders?: number
          talent_pool_enabled?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          application_id: string | null
          created_at: string
          id: string
          message: string
          org_id: string
          read_at: string | null
          recipient_id: string
          store_id: string | null
          type: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          id?: string
          message: string
          org_id: string
          read_at?: string | null
          recipient_id: string
          store_id?: string | null
          type: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          id?: string
          message?: string
          org_id?: string
          read_at?: string | null
          recipient_id?: string
          store_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          application_id: string
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          is_offer_letter: boolean
          job_title: string
          note: string | null
          org_id: string
          pay: string | null
          provider: string
          provider_document_id: string | null
          sent_by: string | null
          start_date: string | null
          status: string
          template_id: string | null
          template_name: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          is_offer_letter?: boolean
          job_title: string
          note?: string | null
          org_id: string
          pay?: string | null
          provider?: string
          provider_document_id?: string | null
          sent_by?: string | null
          start_date?: string | null
          status?: string
          template_id?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          is_offer_letter?: boolean
          job_title?: string
          note?: string | null
          org_id?: string
          pay?: string | null
          provider?: string
          provider_document_id?: string | null
          sent_by?: string | null
          start_date?: string | null
          status?: string
          template_id?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklist_items: {
        Row: {
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          file_path: string | null
          id: string
          item_type: string
          notes: string | null
          org_id: string
          required: boolean
          sort_order: number
          store_id: string
          title: string
          updated_at: string
          who_completes: string
        }
        Insert: {
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          file_path?: string | null
          id?: string
          item_type: string
          notes?: string | null
          org_id: string
          required?: boolean
          sort_order?: number
          store_id: string
          title: string
          updated_at?: string
          who_completes: string
        }
        Update: {
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          file_path?: string | null
          id?: string
          item_type?: string
          notes?: string | null
          org_id?: string
          required?: boolean
          sort_order?: number
          store_id?: string
          title?: string
          updated_at?: string
          who_completes?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "onboarding_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklist_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklist_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklists: {
        Row: {
          application_id: string
          completed_at: string | null
          created_at: string
          id: string
          org_id: string
          start_date: string | null
          status: string
          store_id: string
          template_id: string | null
          token: string
          updated_at: string
        }
        Insert: {
          application_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          org_id: string
          start_date?: string | null
          status?: string
          store_id: string
          template_id?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          org_id?: string
          start_date?: string | null
          status?: string
          store_id?: string
          template_id?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklists_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklists_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_template_items: {
        Row: {
          created_at: string
          description: string | null
          due_business_days: number | null
          id: string
          item_type: string
          org_id: string
          required: boolean
          sort_order: number
          template_id: string
          title: string
          who_completes: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_business_days?: number | null
          id?: string
          item_type: string
          org_id: string
          required?: boolean
          sort_order?: number
          template_id: string
          title: string
          who_completes: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_business_days?: number | null
          id?: string
          item_type?: string
          org_id?: string
          required?: boolean
          sort_order?: number
          template_id?: string
          title?: string
          who_completes?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_template_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          org_id: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          calendar_url: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["org_role"]
          scopes: Json
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          calendar_url?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["org_role"]
          scopes?: Json
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          calendar_url?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          scopes?: Json
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_member_scopes: {
        Row: {
          created_at: string
          dealership_id: string | null
          id: string
          member_id: string
          org_id: string
          region_id: string | null
        }
        Insert: {
          created_at?: string
          dealership_id?: string | null
          id?: string
          member_id: string
          org_id: string
          region_id?: string | null
        }
        Update: {
          created_at?: string
          dealership_id?: string | null
          id?: string
          member_id?: string
          org_id?: string
          region_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_member_scopes_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_scopes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_scopes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_scopes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      possible_duplicates: {
        Row: {
          created_at: string
          id: string
          kept_id: string | null
          match_reason: string
          org_id: string
          record_a_id: string
          record_a_type: string
          record_b_id: string
          record_b_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_a_id: string | null
          store_b_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kept_id?: string | null
          match_reason: string
          org_id: string
          record_a_id: string
          record_a_type: string
          record_b_id: string
          record_b_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_a_id?: string | null
          store_b_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kept_id?: string | null
          match_reason?: string
          org_id?: string
          record_a_id?: string
          record_a_type?: string
          record_b_id?: string
          record_b_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_a_id?: string | null
          store_b_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "possible_duplicates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_events: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          event_date: string
          id: string
          is_active: boolean
          job_id: string | null
          location: string | null
          name: string
          org_id: string
          store_id: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          created_by?: string | null
          event_date: string
          id?: string
          is_active?: boolean
          job_id?: string | null
          location?: string | null
          name: string
          org_id: string
          store_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          event_date?: string
          id?: string
          is_active?: boolean
          job_id?: string | null
          location?: string | null
          name?: string
          org_id?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_bonuses: {
        Row: {
          amount: number | null
          applicant_id: string
          created_at: string
          due_date: string | null
          due_notified_at: string | null
          id: string
          ineligible_reason: string | null
          notes: string | null
          org_id: string
          paid_at: string | null
          payout_stage: string
          referrer_id: string
          status: string
          tier_id: string | null
          tier_name: string | null
        }
        Insert: {
          amount?: number | null
          applicant_id: string
          created_at?: string
          due_date?: string | null
          due_notified_at?: string | null
          id?: string
          ineligible_reason?: string | null
          notes?: string | null
          org_id: string
          paid_at?: string | null
          payout_stage: string
          referrer_id: string
          status?: string
          tier_id?: string | null
          tier_name?: string | null
        }
        Update: {
          amount?: number | null
          applicant_id?: string
          created_at?: string
          due_date?: string | null
          due_notified_at?: string | null
          id?: string
          ineligible_reason?: string | null
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          payout_stage?: string
          referrer_id?: string
          status?: string
          tier_id?: string | null
          tier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_bonuses_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_bonuses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_bonuses_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_bonuses_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "referral_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_drawing_entries: {
        Row: {
          applicant_id: string
          bonus_id: string
          created_at: string
          id: string
          org_id: string
          quarter: string
          referrer_id: string
        }
        Insert: {
          applicant_id: string
          bonus_id: string
          created_at?: string
          id?: string
          org_id: string
          quarter: string
          referrer_id: string
        }
        Update: {
          applicant_id?: string
          bonus_id?: string
          created_at?: string
          id?: string
          org_id?: string
          quarter?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_drawing_entries_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_drawing_entries_bonus_id_fkey"
            columns: ["bonus_id"]
            isOneToOne: true
            referencedRelation: "referral_bonuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_drawing_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_drawing_entries_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_drawings: {
        Row: {
          amount: number | null
          entry_count: number
          id: string
          org_id: string
          picked_at: string
          picked_by: string | null
          quarter: string
          winner_entry_id: string | null
        }
        Insert: {
          amount?: number | null
          entry_count?: number
          id?: string
          org_id: string
          picked_at?: string
          picked_by?: string | null
          quarter: string
          winner_entry_id?: string | null
        }
        Update: {
          amount?: number | null
          entry_count?: number
          id?: string
          org_id?: string
          picked_at?: string
          picked_by?: string | null
          quarter?: string
          winner_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_drawings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_drawings_winner_entry_id_fkey"
            columns: ["winner_entry_id"]
            isOneToOne: false
            referencedRelation: "referral_drawing_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_settings: {
        Row: {
          bonus_30_amount: number | null
          bonus_90_amount: number | null
          drawing_amount: number | null
          drawing_enabled: boolean
          excluded_roles: string[]
          full_time_only: boolean
          org_id: string
          payout_days: number
          require_before_hire: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bonus_30_amount?: number | null
          bonus_90_amount?: number | null
          drawing_amount?: number | null
          drawing_enabled?: boolean
          excluded_roles?: string[]
          full_time_only?: boolean
          org_id: string
          payout_days?: number
          require_before_hire?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bonus_30_amount?: number | null
          bonus_90_amount?: number | null
          drawing_amount?: number | null
          drawing_enabled?: boolean
          excluded_roles?: string[]
          full_time_only?: boolean
          org_id?: string
          payout_days?: number
          require_before_hire?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_tiers: {
        Row: {
          amount: number
          covers: string[]
          created_at: string
          excludes: string[]
          id: string
          is_default: boolean
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          amount?: number
          covers?: string[]
          created_at?: string
          excludes?: string[]
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          covers?: string[]
          created_at?: string
          excludes?: string[]
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_tiers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referrers: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          department: string | null
          email: string | null
          email_norm: string | null
          employee_name: string
          id: string
          org_id: string
          phone: string | null
          phone_norm: string | null
          referral_code: string
          role_title: string | null
          store_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          email_norm?: string | null
          employee_name: string
          id?: string
          org_id: string
          phone?: string | null
          phone_norm?: string | null
          referral_code?: string
          role_title?: string | null
          store_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          email_norm?: string | null
          employee_name?: string
          id?: string
          org_id?: string
          phone?: string | null
          phone_norm?: string | null
          referral_code?: string
          role_title?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_checkins: {
        Row: {
          application_id: string
          created_at: string
          day_mark: number
          due_on: string
          id: string
          org_id: string
          responded_at: string | null
          response: string | null
          sent_at: string | null
          still_employed: boolean | null
        }
        Insert: {
          application_id: string
          created_at?: string
          day_mark: number
          due_on: string
          id?: string
          org_id: string
          responded_at?: string | null
          response?: string | null
          sent_at?: string | null
          still_employed?: boolean | null
        }
        Update: {
          application_id?: string
          created_at?: string
          day_mark?: number
          due_on?: string
          id?: string
          org_id?: string
          responded_at?: string | null
          response?: string | null
          sent_at?: string | null
          still_employed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_checkins_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_checkins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_opt_outs: {
        Row: {
          id: string
          opted_out_at: string
          org_id: string
          phone: string
          source: string | null
        }
        Insert: {
          id?: string
          opted_out_at?: string
          org_id: string
          phone: string
          source?: string | null
        }
        Update: {
          id?: string
          opted_out_at?: string
          org_id?: string
          phone?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_opt_outs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      status_reminder_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          org_id: string
          remind_after_days: number
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          org_id: string
          remind_after_days: number
          status: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string
          remind_after_days?: number
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_reminder_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_calendars: {
        Row: {
          created_at: string
          created_by: string | null
          dealership_id: string | null
          ics_url: string
          id: string
          label: string
          last_checked_at: string | null
          last_error: string | null
          member_id: string | null
          org_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dealership_id?: string | null
          ics_url: string
          id?: string
          label: string
          last_checked_at?: string | null
          last_error?: string | null
          member_id?: string | null
          org_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dealership_id?: string | null
          ics_url?: string
          id?: string
          label?: string
          last_checked_at?: string | null
          last_error?: string | null
          member_id?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_calendars_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_calendars_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_calendars_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_texting: {
        Row: {
          live: boolean
          messaging_service_sid: string | null
          org_id: string
          phone_number_sid: string | null
          store_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          live?: boolean
          messaging_service_sid?: string | null
          org_id: string
          phone_number_sid?: string | null
          store_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          live?: boolean
          messaging_service_sid?: string | null
          org_id?: string
          phone_number_sid?: string | null
          store_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_texting_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_texting_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      store_videos: {
        Row: {
          created_at: string
          enabled: boolean
          file_name: string | null
          id: string
          kind: string
          org_id: string
          storage_path: string
          store_id: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          file_name?: string | null
          id?: string
          kind: string
          org_id: string
          storage_path: string
          store_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          file_name?: string | null
          id?: string
          kind?: string
          org_id?: string
          storage_path?: string
          store_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_videos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_videos_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_summaries: {
        Row: {
          body: string | null
          created_at: string
          error: string | null
          id: string
          member_id: string
          org_id: string
          sent_at: string | null
          status: string
          subject: string | null
          to_email: string | null
          week_of: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          error?: string | null
          id?: string
          member_id: string
          org_id: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          week_of: string
        }
        Update: {
          body?: string | null
          created_at?: string
          error?: string | null
          id?: string
          member_id?: string
          org_id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_summaries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_summaries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      applicant_scan_counts: {
        Row: {
          applicants: number | null
          event_id: string | null
          event_name: string | null
          hires: number | null
          kind: string | null
          org_id: string | null
          store_id: string | null
        }
        Relationships: []
      }
      applicant_source_counts: {
        Row: {
          applicants: number | null
          hires: number | null
          org_id: string | null
          org_total: boolean | null
          source: string | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_dealership_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_business_days: { Args: { _d: string; _n: number }; Returns: string }
      bulk_next_text_time: {
        Args: {
          _days: number[]
          _end: string
          _now: string
          _start: string
          _zone: string
        }
        Returns: string
      }
      bulk_phone: { Args: { _raw: string }; Returns: string }
      bulk_render: {
        Args: { _job: string; _name: string; _store: string; _text: string }
        Returns: string
      }
      bulk_skip_reason: {
        Args: { _app: string; _channel: string; _demo: boolean }
        Returns: string
      }
      can_access_application: {
        Args: { _app: string; _uid: string }
        Returns: boolean
      }
      can_access_onboarding: {
        Args: { _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      can_access_store: {
        Args: { _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      can_bulk_message: {
        Args: { _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      can_manage_events: {
        Args: { _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      can_manage_referrals: {
        Args: { _org: string; _uid: string }
        Returns: boolean
      }
      can_manage_store_videos: {
        Args: { _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      can_post_jobs: { Args: { _org: string; _uid: string }; Returns: boolean }
      can_read_compliance_record: {
        Args: { _app: string; _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      can_see_pool_region: {
        Args: { _org: string; _region: string; _uid: string }
        Returns: boolean
      }
      claim_pool_candidate: {
        Args: { _app: string; _job?: string; _store: string }
        Returns: string
      }
      create_organization: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
      detect_duplicates_for: {
        Args: { _id: string; _org: string; _type: string }
        Returns: number
      }
      five_business_days_after: { Args: { _start: string }; Returns: string }
      has_org_role: {
        Args: {
          _org: string
          _role: Database["public"]["Enums"]["org_role"]
          _uid: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _uid: string }; Returns: boolean }
      is_platform_admin: { Args: { _uid: string }; Returns: boolean }
      is_store_staff_for: {
        Args: { _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      mark_not_duplicate: { Args: { _dup: string }; Returns: boolean }
      merge_duplicate: {
        Args: { _dup: string; _keep: string }
        Returns: string
      }
      norm_email: { Args: { _e: string }; Returns: string }
      norm_name: { Args: { _n: string }; Returns: string }
      norm_phone: { Args: { _p: string }; Returns: string }
      onboarding_by_token: { Args: { _token: string }; Returns: Json }
      onboarding_complete_item: {
        Args: {
          _file_path?: string
          _item: string
          _notes?: string
          _token: string
        }
        Returns: boolean
      }
      person_records: {
        Args: { _org: string }
        Returns: {
          email_n: string
          name_n: string
          phone_n: string
          rid: string
          rtype: string
          store_id: string
        }[]
      }
      pick_referral_drawing_winner: {
        Args: { _org: string; _quarter: string }
        Returns: string
      }
      referral_word_match: {
        Args: { _text: string; _words: string[] }
        Returns: boolean
      }
      referrer_by_code: {
        Args: { _code: string; _org: string }
        Returns: {
          employee_name: string
          id: string
        }[]
      }
      resolve_scan: {
        Args: { _code: string }
        Returns: {
          event_id: string
          job_id: string
          kind: string
          name: string
          org_slug: string
          store_id: string
          store_name: string
        }[]
      }
      return_to_talent_pool: {
        Args: { _app: string; _reason?: string }
        Returns: string
      }
      run_status_reminders: { Args: { _org?: string }; Returns: number }
      run_status_reminders_now: { Args: { _org: string }; Returns: number }
      seed_onboarding_template: { Args: { _org: string }; Returns: undefined }
      seed_referral_program: { Args: { _org: string }; Returns: undefined }
      seed_status_reminder_rules: { Args: { _org: string }; Returns: undefined }
      send_bulk_applicants: {
        Args: {
          _applicant_ids: string[]
          _body: string
          _channel: string
          _org: string
          _subject?: string
        }
        Returns: Json
      }
      store_texting_status: {
        Args: { _org: string }
        Returns: {
          live: boolean
          sms_number: string
          store_id: string
          store_name: string
        }[]
      }
      suggest_referral_tier: {
        Args: { _org: string; _title: string }
        Returns: string
      }
    }
    Enums: {
      application_status:
        | "new"
        | "screening"
        | "interview"
        | "offer"
        | "hired"
        | "rejected"
        | "unqualified"
        | "other_location"
        | "hiring_event"
        | "do_not_hire"
      org_role:
        | "group_admin"
        | "dealer_manager"
        | "hiring_manager"
        | "recruiter"
        | "regional_leader"
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
    Enums: {
      application_status: [
        "new",
        "screening",
        "interview",
        "offer",
        "hired",
        "rejected",
        "unqualified",
        "other_location",
        "hiring_event",
        "do_not_hire",
      ],
      org_role: [
        "group_admin",
        "dealer_manager",
        "hiring_manager",
        "recruiter",
        "regional_leader",
      ],
    },
  },
} as const
