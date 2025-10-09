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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id_number: string | null
          last_name: string | null
          office_address: string | null
          profile_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id_number?: string | null
          last_name?: string | null
          office_address?: string | null
          profile_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id_number?: string | null
          last_name?: string | null
          office_address?: string | null
          profile_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_transactions: {
        Row: {
          admin_id: string
          amount: number
          booking_id: string
          checkout_request_id: string | null
          commission_amount: number
          commission_rate: number
          created_at: string | null
          guest_id: string
          host_id: string
          id: number
          mpesa_receipt_number: string | null
          status: string | null
          transaction_date: string | null
          transaction_type: string
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          amount: number
          booking_id: string
          checkout_request_id?: string | null
          commission_amount: number
          commission_rate?: number
          created_at?: string | null
          guest_id: string
          host_id: string
          id?: number
          mpesa_receipt_number?: string | null
          status?: string | null
          transaction_date?: string | null
          transaction_type: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          amount?: number
          booking_id?: string
          checkout_request_id?: string | null
          commission_amount?: number
          commission_rate?: number
          created_at?: string | null
          guest_id?: string
          host_id?: string
          id?: number
          mpesa_receipt_number?: string | null
          status?: string | null
          transaction_date?: string | null
          transaction_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_transactions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_transactions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_transactions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_wallets: {
        Row: {
          admin_id: string
          balance: number
          created_at: string | null
          id: number
          payable_balance: number
          total_commission: number
          total_paid_out: number
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          balance?: number
          created_at?: string | null
          id?: number
          payable_balance?: number
          total_commission?: number
          total_paid_out?: number
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          balance?: number
          created_at?: string | null
          id?: number
          payable_balance?: number
          total_commission?: number
          total_paid_out?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_wallets_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      amenities: {
        Row: {
          id: number
          key: string
          name: string
        }
        Insert: {
          id?: number
          key: string
          name: string
        }
        Update: {
          id?: number
          key?: string
          name?: string
        }
        Relationships: []
      }
      b2c_payouts: {
        Row: {
          amount: number
          b2c_charges_paid_funds: number | null
          b2c_recipient_is_registered: boolean | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string | null
          host_id: string
          id: number
          originator_conversation_id: string | null
          receiver_name: string | null
          receiverPhoneNumber: string | null
          result_code: number | null
          result_desc: string | null
          transaction_id: string | null
          transaction_receipt: string | null
        }
        Insert: {
          amount: number
          b2c_charges_paid_funds?: number | null
          b2c_recipient_is_registered?: boolean | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          host_id: string
          id?: number
          originator_conversation_id?: string | null
          receiver_name?: string | null
          receiverPhoneNumber?: string | null
          result_code?: number | null
          result_desc?: string | null
          transaction_id?: string | null
          transaction_receipt?: string | null
        }
        Update: {
          amount?: number
          b2c_charges_paid_funds?: number | null
          b2c_recipient_is_registered?: boolean | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          host_id?: string
          id?: number
          originator_conversation_id?: string | null
          receiver_name?: string | null
          receiverPhoneNumber?: string | null
          result_code?: number | null
          result_desc?: string | null
          transaction_id?: string | null
          transaction_receipt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "b2c_payouts_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_ratings: {
        Row: {
          booking_id: string
          cleanliness: number | null
          comment: string
          communication: number | null
          created_at: string | null
          furniture_quality: number | null
          guest_id: string | null
          host_id: string | null
          id: string
          location: number | null
          overall_rating: number
          rated_by: string
          security: number | null
          updated_at: string | null
        }
        Insert: {
          booking_id: string
          cleanliness?: number | null
          comment: string
          communication?: number | null
          created_at?: string | null
          furniture_quality?: number | null
          guest_id?: string | null
          host_id?: string | null
          id?: string
          location?: number | null
          overall_rating: number
          rated_by: string
          security?: number | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string
          cleanliness?: number | null
          comment?: string
          communication?: number | null
          created_at?: string | null
          furniture_quality?: number | null
          guest_id?: string | null
          host_id?: string | null
          id?: string
          location?: number | null
          overall_rating?: number
          rated_by?: string
          security?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_ratings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_ratings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_ratings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_ratings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_transactions: {
        Row: {
          booking_id: string
          commission_amount: number
          commission_applied: boolean
          created_at: string | null
          full_amount: number
          host_id: string
          id: string
          reservation_amount: number
          total_amount: number
          transaction_ids: Json | null
          updated_at: string | null
        }
        Insert: {
          booking_id: string
          commission_amount?: number
          commission_applied?: boolean
          created_at?: string | null
          full_amount?: number
          host_id: string
          id?: string
          reservation_amount?: number
          total_amount?: number
          transaction_ids?: Json | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string
          commission_amount?: number
          commission_applied?: boolean
          created_at?: string | null
          full_amount?: number
          host_id?: string
          id?: string
          reservation_amount?: number
          total_amount?: number
          transaction_ids?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transactions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancellation_reason: string | null
          check_in: string
          check_out: string
          created_at: string | null
          currency: string | null
          guest_id: string
          guests: number
          host_id: string
          id: string
          is_reservation: boolean | null
          listing_id: string
          nights: number | null
          payment_deadline: string | null
          payment_status: string
          rejection_reason: string | null
          reservation_fee: number | null
          service_fees: number | null
          special_requests: string | null
          status: string
          subtotal: number
          taxes: number | null
          total_amount: number
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          check_in: string
          check_out: string
          created_at?: string | null
          currency?: string | null
          guest_id: string
          guests: number
          host_id: string
          id?: string
          is_reservation?: boolean | null
          listing_id: string
          nights?: number | null
          payment_deadline?: string | null
          payment_status?: string
          rejection_reason?: string | null
          reservation_fee?: number | null
          service_fees?: number | null
          special_requests?: string | null
          status?: string
          subtotal: number
          taxes?: number | null
          total_amount: number
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          check_in?: string
          check_out?: string
          created_at?: string | null
          currency?: string | null
          guest_id?: string
          guests?: number
          host_id?: string
          id?: string
          is_reservation?: boolean | null
          listing_id?: string
          nights?: number | null
          payment_deadline?: string | null
          payment_status?: string
          rejection_reason?: string | null
          reservation_fee?: number | null
          service_fees?: number | null
          special_requests?: string | null
          status?: string
          subtotal?: number
          taxes?: number | null
          total_amount?: number
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "host_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          body: string | null
          created_at: string | null
          error: string | null
          id: string
          metadata: Json | null
          recipient_email: string
          status: string
          subject: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          recipient_email: string
          status?: string
          subject: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      guest_profiles: {
        Row: {
          created_at: string | null
          full_name: string
          gender: string | null
          national_id: string
          nationality: string | null
          phone: string
          profile_image: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          full_name: string
          gender?: string | null
          national_id: string
          nationality?: string | null
          phone: string
          profile_image?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          full_name?: string
          gender?: string | null
          national_id?: string
          nationality?: string | null
          phone?: string
          profile_image?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      host_profiles: {
        Row: {
          created_at: string | null
          first_name: string
          id_back_url: string
          id_front_url: string
          is_verified: boolean
          last_name: string
          national_id: string
          phone: string
          profile_image: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          first_name: string
          id_back_url: string
          id_front_url: string
          is_verified?: boolean
          last_name: string
          national_id: string
          phone: string
          profile_image?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          first_name?: string
          id_back_url?: string
          id_front_url?: string
          is_verified?: boolean
          last_name?: string
          national_id?: string
          phone?: string
          profile_image?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      host_transactions: {
        Row: {
          amount: number
          booking_id: string
          checkout_request_id: string | null
          commission_amount: number
          commission_rate: number
          created_at: string | null
          guest_id: string
          host_id: string
          id: number
          mpesa_receipt_number: string | null
          net_amount: number
          status: string | null
          transaction_date: string | null
          transaction_type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          checkout_request_id?: string | null
          commission_amount: number
          commission_rate?: number
          created_at?: string | null
          guest_id: string
          host_id: string
          id?: number
          mpesa_receipt_number?: string | null
          net_amount: number
          status?: string | null
          transaction_date?: string | null
          transaction_type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          checkout_request_id?: string | null
          commission_amount?: number
          commission_rate?: number
          created_at?: string | null
          guest_id?: string
          host_id?: string
          id?: number
          mpesa_receipt_number?: string | null
          net_amount?: number
          status?: string | null
          transaction_date?: string | null
          transaction_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_transactions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_transactions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      host_wallets: {
        Row: {
          available_balance: number
          created_at: string | null
          host_id: string
          id: number
          pending_balance: number
          updated_at: string | null
          withdrawn_total: number
        }
        Insert: {
          available_balance?: number
          created_at?: string | null
          host_id: string
          id?: number
          pending_balance?: number
          updated_at?: string | null
          withdrawn_total?: number
        }
        Update: {
          available_balance?: number
          created_at?: string | null
          host_id?: string
          id?: number
          pending_balance?: number
          updated_at?: string | null
          withdrawn_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "host_wallets_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_amenities: {
        Row: {
          amenity_key: string
          created_at: string | null
          id: string
          listing_id: string
        }
        Insert: {
          amenity_key: string
          created_at?: string | null
          id?: string
          listing_id: string
        }
        Update: {
          amenity_key?: string
          created_at?: string | null
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_amenities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_blocked_dates: {
        Row: {
          blocked_date: string
          created_at: string | null
          id: string
          listing_id: string
          source: string | null
        }
        Insert: {
          blocked_date: string
          created_at?: string | null
          id?: string
          listing_id: string
          source?: string | null
        }
        Update: {
          blocked_date?: string
          created_at?: string | null
          id?: string
          listing_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_blocked_dates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_ical_urls: {
        Row: {
          created_at: string | null
          ical_url: string
          id: string
          last_synced: string | null
          listing_id: string
        }
        Insert: {
          created_at?: string | null
          ical_url: string
          id?: string
          last_synced?: string | null
          listing_id: string
        }
        Update: {
          created_at?: string | null
          ical_url?: string
          id?: string
          last_synced?: string | null
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_ical_urls_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          is_featured: boolean | null
          listing_id: string
          position: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          is_featured?: boolean | null
          listing_id: string
          position?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          is_featured?: boolean | null
          listing_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_rejections: {
        Row: {
          admin_id: string
          created_at: string | null
          host_id: string
          id: string
          listing_id: string
          rejection_message: string
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          host_id: string
          id?: string
          listing_id: string
          rejection_message: string
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          host_id?: string
          id?: string
          listing_id?: string
          rejection_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_rejections_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_rejections_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_rejections_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_services: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          listing_id: string
          price: number | null
          title: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          listing_id: string
          price?: number | null
          title?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          listing_id?: string
          price?: number | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_services_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string | null
          availability_enabled: boolean | null
          blocked_dates: Json | null
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          created_at: string | null
          description: string
          designation: string | null
          external_listing_url: string | null
          featured_image: string | null
          host_id: string
          id: string
          is_listing_featured: boolean | null
          latitude: number | null
          location: unknown | null
          longitude: number | null
          max_guests: number | null
          min_guests: number | null
          min_stay: number | null
          n_reviews: number | null
          property_type: string | null
          rating: number | null
          regular_price: number | null
          reservation_fee: number | null
          status: string | null
          title: string
          updated_at: string | null
          weekend_price: number | null
        }
        Insert: {
          address?: string | null
          availability_enabled?: boolean | null
          blocked_dates?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string | null
          description: string
          designation?: string | null
          external_listing_url?: string | null
          featured_image?: string | null
          host_id: string
          id?: string
          is_listing_featured?: boolean | null
          latitude?: number | null
          location?: unknown | null
          longitude?: number | null
          max_guests?: number | null
          min_guests?: number | null
          min_stay?: number | null
          n_reviews?: number | null
          property_type?: string | null
          rating?: number | null
          regular_price?: number | null
          reservation_fee?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
          weekend_price?: number | null
        }
        Update: {
          address?: string | null
          availability_enabled?: boolean | null
          blocked_dates?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string | null
          description?: string
          designation?: string | null
          external_listing_url?: string | null
          featured_image?: string | null
          host_id?: string
          id?: string
          is_listing_featured?: boolean | null
          latitude?: number | null
          location?: unknown | null
          longitude?: number | null
          max_guests?: number | null
          min_guests?: number | null
          min_stay?: number | null
          n_reviews?: number | null
          property_type?: string | null
          rating?: number | null
          regular_price?: number | null
          reservation_fee?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
          weekend_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_refunds: {
        Row: {
          amount: number
          b2c_charges_paid_funds: number | null
          b2c_recipient_is_registered: boolean | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string | null
          guest_id: string
          id: number
          originator_conversation_id: string | null
          receiver_name: string | null
          receiverphonenumber: string | null
          result_code: number | null
          result_desc: string | null
          status: string
          transaction_id: string | null
          transaction_receipt: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          b2c_charges_paid_funds?: number | null
          b2c_recipient_is_registered?: boolean | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          guest_id: string
          id?: number
          originator_conversation_id?: string | null
          receiver_name?: string | null
          receiverphonenumber?: string | null
          result_code?: number | null
          result_desc?: string | null
          status?: string
          transaction_id?: string | null
          transaction_receipt?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          b2c_charges_paid_funds?: number | null
          b2c_recipient_is_registered?: boolean | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          guest_id?: string
          id?: number
          originator_conversation_id?: string | null
          receiver_name?: string | null
          receiverphonenumber?: string | null
          result_code?: number | null
          result_desc?: string | null
          status?: string
          transaction_id?: string | null
          transaction_receipt?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_refunds_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          amount: number
          conversation_id: string | null
          created_at: string | null
          host_id: string
          id: string
          originator_conversation_id: string | null
          phone_number: string | null
          remote_response: string | null
          status: string | null
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          conversation_id?: string | null
          created_at?: string | null
          host_id: string
          id?: string
          originator_conversation_id?: string | null
          phone_number?: string | null
          remote_response?: string | null
          status?: string | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          conversation_id?: string | null
          created_at?: string | null
          host_id?: string
          id?: string
          originator_conversation_id?: string | null
          phone_number?: string | null
          remote_response?: string | null
          status?: string | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_stk: {
        Row: {
          amount: number
          booking_id: string
          checkout_request_id: string | null
          created_at: string | null
          guest_id: string
          host_id: string
          id: string
          is_reservation: boolean | null
          merchant_request_id: string | null
          reservation_fee: number | null
        }
        Insert: {
          amount: number
          booking_id: string
          checkout_request_id?: string | null
          created_at?: string | null
          guest_id: string
          host_id: string
          id?: string
          is_reservation?: boolean | null
          merchant_request_id?: string | null
          reservation_fee?: number | null
        }
        Update: {
          amount?: number
          booking_id?: string
          checkout_request_id?: string | null
          created_at?: string | null
          guest_id?: string
          host_id?: string
          id?: string
          is_reservation?: boolean | null
          merchant_request_id?: string | null
          reservation_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_stk_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_stk_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_stk_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_stk_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          role: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          expo_push_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stk_payments: {
        Row: {
          amount: number
          booking_id: string | null
          checkout_request_id: string | null
          created_at: string | null
          guest_id: string | null
          host_id: string | null
          id: number
          is_reservation: boolean | null
          merchant_request_id: string | null
          mpesa_receipt: string | null
          phone_number: number | null
          result_code: number | null
          result_desc: string | null
          transaction_date: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          checkout_request_id?: string | null
          created_at?: string | null
          guest_id?: string | null
          host_id?: string | null
          id?: number
          is_reservation?: boolean | null
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          phone_number?: number | null
          result_code?: number | null
          result_desc?: string | null
          transaction_date?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          checkout_request_id?: string | null
          created_at?: string | null
          guest_id?: string | null
          host_id?: string | null
          id?: number
          is_reservation?: boolean | null
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          phone_number?: number | null
          result_code?: number | null
          result_desc?: string | null
          transaction_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stk_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stk_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stk_payments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stk_payments_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string | null
          id: string
          kind: string
          metadata: Json | null
          reference_id: string | null
          source: string
          wallet_id: string
          wallet_type: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          reference_id?: string | null
          source: string
          wallet_id: string
          wallet_type: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          reference_id?: string | null
          source?: string
          wallet_id?: string
          wallet_type?: string
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          created_at: string | null
          guest_id: string
          id: string
          listing_id: string
        }
        Insert: {
          created_at?: string | null
          guest_id: string
          id?: string
          listing_id: string
        }
        Update: {
          created_at?: string | null
          guest_id?: string
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_guest_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wishlist_listing_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      booking_analytics: {
        Row: {
          created_at: string | null
          guest_rating: number | null
          has_cancellation_reason: boolean | null
          has_rejection_reason: boolean | null
          host_rating: number | null
          hours_until_deadline: number | null
          id: string | null
          is_reservation: boolean | null
          payment_deadline: string | null
          payment_status: string | null
          reservation_fee: number | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auto_cancel_expired_bookings: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      calculate_property_rating: {
        Args: { property_id: string }
        Returns: {
          avg_cleanliness: number
          avg_communication: number
          avg_furniture_quality: number
          avg_location: number
          avg_overall: number
          avg_security: number
          total_reviews: number
        }[]
      }
      ensure_admin_wallet_exists: {
        Args: { admin_uuid: string }
        Returns: undefined
      }
      ensure_host_wallet_exists: {
        Args: { host_uuid: string }
        Returns: undefined
      }
      nearby_listings: {
        Args: {
          p_available_dates?: string[]
          p_distance_km: number
          p_lat: number
          p_lng: number
          p_max_guests?: number
          p_max_price?: number
          p_min_guests?: number
          p_min_price?: number
          p_min_stay?: number
        }
        Returns: {
          address: string
          availability_enabled: boolean
          available_dates: Json
          blocked_dates: Json
          contact_email: string
          contact_phone: string
          contact_whatsapp: string
          created_at: string
          description: string
          designation: string
          distance_meters: number
          external_listing_url: string
          featured_image: string
          host_id: string
          id: string
          is_listing_featured: boolean
          latitude: number
          location: unknown
          longitude: number
          max_guests: number
          min_guests: number
          min_stay: number
          n_reviews: number
          property_type: string
          rating: number
          regular_price: number
          reservation_fee: number
          status: string
          title: string
          updated_at: string
          weekend_price: number
        }[]
      }
      nearby_listings2: {
        Args: {
          p_distance_km: number
          p_lat: number
          p_lng: number
          p_max_guests?: number
          p_max_price?: number
          p_min_guests?: number
          p_min_price?: number
          p_min_stay?: number
          p_requested_dates?: string[]
        }
        Returns: {
          address: string
          availability_enabled: boolean
          blocked_dates: Json
          contact_email: string
          contact_phone: string
          contact_whatsapp: string
          created_at: string
          description: string
          designation: string
          distance_meters: number
          external_listing_url: string
          featured_image: string
          host_id: string
          id: string
          is_listing_featured: boolean
          latitude: number
          location: unknown
          longitude: number
          max_guests: number
          min_guests: number
          min_stay: number
          n_reviews: number
          property_type: string
          rating: number
          regular_price: number
          reservation_fee: number
          status: string
          title: string
          updated_at: string
          weekend_price: number
        }[]
      }
      process_payment_transaction: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_checkout_request_id: string
          p_commission_rate?: number
          p_guest_id: string
          p_host_id: string
          p_mpesa_receipt_number: string
          p_transaction_type: string
        }
        Returns: Json
      }
      total_host_reviews: {
        Args: { p_host_id: string }
        Returns: number
      }
    }
    Enums: {
      booking_status: "pending" | "confirmed" | "cancelled" | "expired"
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
      booking_status: ["pending", "confirmed", "cancelled", "expired"],
    },
  },
} as const
