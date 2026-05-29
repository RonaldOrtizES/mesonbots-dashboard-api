import type { Request } from 'express';

// ═══════════════════════════════════════════════════
// Tipos del JWT y request autenticado
// ═══════════════════════════════════════════════════

export interface JwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: 'owner' | 'admin' | 'staff' | 'viewer';
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

// ═══════════════════════════════════════════════════
// Modelos del dominio (espejos de las tablas SQL)
// ═══════════════════════════════════════════════════

export type PlanType = 'cuartito' | 'vecino' | 'patron' | 'templo' | 'founder';
export type LoyaltyTier = 'nuevo' | 'conocido' | 'compadre' | 'patrono';
export type TenantStatus = 'trial' | 'active' | 'paused' | 'cancelled' | 'suspended';

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'reminded'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type ConversationStatus = 'open' | 'closed' | 'escalated' | 'archived';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'template'
  | 'interactive'
  | 'system';

export interface Character {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  vertical: string;
  vertical_label: string;
  avatar_emoji: string;
  primary_color: string;
  base_prompt: string;
  is_active: boolean;
}

export interface Tenant {
  id: string;
  business_name: string;
  business_slug: string;
  business_type: string;
  owner_name: string;
  owner_email: string;
  whatsapp_phone: string;
  character_id: string;
  character_custom_name: string | null;
  plan: PlanType;
  status: TenantStatus;
  loyalty_tier: LoyaltyTier;
  timezone: string;
  created_at: Date;
  activated_at: Date | null;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  end_customer_id: string | null;
  customer_phone: string;
  customer_name: string | null;
  status: ConversationStatus;
  total_messages: number;
  inbound_messages: number;
  outbound_messages: number;
  last_message_at: Date;
  created_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  tenant_id: string;
  direction: MessageDirection;
  message_type: MessageType;
  content: string;
  generated_by_ai: boolean;
  delivery_status: string | null;
  created_at: Date;
}

export interface Appointment {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  scheduled_at: Date;
  duration_minutes: number;
  status: AppointmentStatus;
  notes: string | null;
}

export interface EndCustomer {
  id: string;
  tenant_id: string;
  whatsapp_phone: string;
  name: string | null;
  is_vip: boolean;
  total_conversations: number;
  total_appointments: number;
  last_contact_at: Date;
  notes: string | null;
}

// ═══════════════════════════════════════════════════
// Respuestas HTTP estandarizadas
// ═══════════════════════════════════════════════════

export interface ApiResponse<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: unknown;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;
