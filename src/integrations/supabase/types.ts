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
          background_check_note: string | null
          background_check_status: string | null
          background_check_updated_at: string | null
          candidate_id: string | null
          created_at: string
          dealership_id: string
          departed_at: string | null
          departure_reason: string | null
          email: string
          full_name: string
          hired_at: string | null
          id: string
          job_id: string
          knockout_failed: boolean
          needs_attention: string | null
          notes: string | null
          open_to_other_stores: boolean
          org_id: string
          phone: string | null
          profile: Json
          rating: number | null
          resume_path: string | null
          source: string
          start_date: string | null
          status: Database["public"]["Enums"]["application_status"]
          status_token: string
          updated_at: string
        }
        Insert: {
          ai_paused_at?: string | null
          ai_summary?: string | null
          answers?: Json
          background_check_note?: string | null
          background_check_status?: string | null
          background_check_updated_at?: string | null
          candidate_id?: string | null
          created_at?: string
          dealership_id: string
          departed_at?: string | null
          departure_reason?: string | null
          email: string
          full_name: string
          hired_at?: string | null
          id?: string
          job_id: string
          knockout_failed?: boolean
          needs_attention?: string | null
          notes?: string | null
          open_to_other_stores?: boolean
          org_id: string
          phone?: string | null
          profile?: Json
          rating?: number | null
          resume_path?: string | null
          source?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          status_token?: string
          updated_at?: string
        }
        Update: {
          ai_paused_at?: string | null
          ai_summary?: string | null
          answers?: Json
          background_check_note?: string | null
          background_check_status?: string | null
          background_check_updated_at?: string | null
          candidate_id?: string | null
          created_at?: string
          dealership_id?: string
          departed_at?: string | null
          departure_reason?: string | null
          email?: string
          full_name?: string
          hired_at?: string | null
          id?: string
          job_id?: string
          knockout_failed?: boolean
          needs_attention?: string | null
          notes?: string | null
          open_to_other_stores?: boolean
          org_id?: string
          phone?: string | null
          profile?: Json
          rating?: number | null
          resume_path?: string | null
          source?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          status_token?: string
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
            foreignKeyName: "applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          updated_at: string | null
        }
        Insert: {
          ai_provider?: string
          automations?: Json
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
          updated_at?: string | null
        }
        Update: {
          ai_provider?: string
          automations?: Json
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
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
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
      [_ in never]: never
    }
    Functions: {
      can_access_application: {
        Args: { _app: string; _uid: string }
        Returns: boolean
      }
      can_access_store: {
        Args: { _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      can_post_jobs: { Args: { _org: string; _uid: string }; Returns: boolean }
      can_read_compliance_record: {
        Args: { _app: string; _org: string; _store: string; _uid: string }
        Returns: boolean
      }
      create_organization: {
        Args: { _name: string; _slug: string }
        Returns: string
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
    }
    Enums: {
      application_status:
        | "new"
        | "screening"
        | "interview"
        | "offer"
        | "hired"
        | "rejected"
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
