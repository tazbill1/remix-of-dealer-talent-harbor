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
      application_events: {
        Row: {
          application_id: string
          created_at: string
          id: string
          kind: string
          message: string
          org_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          kind: string
          message: string
          org_id: string
        }
        Update: {
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
          created_at: string
          dealership_id: string
          email: string
          full_name: string
          id: string
          job_id: string
          notes: string | null
          open_to_other_stores: boolean
          org_id: string
          phone: string | null
          rating: number | null
          resume_path: string | null
          source: string
          status: Database["public"]["Enums"]["application_status"]
          status_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dealership_id: string
          email: string
          full_name: string
          id?: string
          job_id: string
          notes?: string | null
          open_to_other_stores?: boolean
          org_id: string
          phone?: string | null
          rating?: number | null
          resume_path?: string | null
          source?: string
          status?: Database["public"]["Enums"]["application_status"]
          status_token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dealership_id?: string
          email?: string
          full_name?: string
          id?: string
          job_id?: string
          notes?: string | null
          open_to_other_stores?: boolean
          org_id?: string
          phone?: string | null
          rating?: number | null
          resume_path?: string | null
          source?: string
          status?: Database["public"]["Enums"]["application_status"]
          status_token?: string
          updated_at?: string
        }
        Relationships: [
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
      dealerships: {
        Row: {
          address: string | null
          assistant_name: string
          brand: string | null
          city: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          state: string | null
        }
        Insert: {
          address?: string | null
          assistant_name?: string
          brand?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          state?: string | null
        }
        Update: {
          address?: string | null
          assistant_name?: string
          brand?: string | null
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealerships_org_id_fkey"
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
          employment_type: string
          id: string
          org_id: string
          pay_max: number | null
          pay_min: number | null
          pay_period: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          dealership_id: string
          department?: string | null
          description?: string
          employment_type?: string
          id?: string
          org_id: string
          pay_max?: number | null
          pay_min?: number | null
          pay_period?: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          dealership_id?: string
          department?: string | null
          description?: string
          employment_type?: string
          id?: string
          org_id?: string
          pay_max?: number | null
          pay_min?: number | null
          pay_period?: string
          status?: string
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
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
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
      ],
    },
  },
} as const
