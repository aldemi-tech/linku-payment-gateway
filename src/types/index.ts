/**
 * Payment Gateway Types
 * Based on Linku app models
 */

import { Timestamp } from "firebase-admin/firestore";

// ==================== PAYMENT PROVIDER TYPES ====================

export type PaymentProvider = "stripe" | "transbank" | "mercadopago";

export type TokenizationMethod = "direct" | "redirect";

export type PaymentMethod = "card" | "bank_transfer" | "cash" | "other";

export interface PaymentProviderConfig {
  provider: PaymentProvider;
  method: TokenizationMethod;
  publicKey?: string;
  secretKey?: string;
  merchantId?: string;
  webhookSecret?: string;
  apiUrl?: string;
  // Transbank specific
  commerceCode?: string;
  apiKey?: string;
  environment?: string;
  // MercadoPago specific
  accessToken?: string;
  enabled: boolean;
}

// ==================== CARD TYPES ====================

export interface PaymentCard {
  card_id: string;
  user_id: string;
  card_holder_name: string;
  card_last_four: string;
  card_brand: 'visa' | 'mastercard' | 'amex' | 'other';
  card_type: 'credit' | 'debit';
  expiration_month: number;
  expiration_year: number;
  alias?: string; // Nombre personalizado para identificar la tarjeta
  is_default: boolean;
  // Token del procesador de pagos (ej: Stripe, MercadoPago)
  payment_token?: string;
  // Expiración del token (suscripción)
  token_expires_at?: Timestamp;
  // Indica si requiere CVC para pagos futuros
  requires_cvv_for_payments: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Mantenemos CardToken para retrocompatibilidad
export interface CardToken {
  token_id: string;
  user_id: string;
  provider: PaymentProvider;
  card_last4: string;
  card_brand: string; // visa, mastercard, amex, etc.
  card_exp_month: number;
  card_exp_year: number;
  card_holder_name?: string;
  is_default: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  metadata?: Record<string, unknown>;
}

// ==================== TOKENIZATION REQUEST TYPES ====================

export interface DirectTokenizationRequest {
  user_id: string;
  provider: PaymentProvider;
  card_number: string;
  card_exp_month: number;
  card_exp_year: number;
  card_cvv: string;
  card_holder_name: string;
  set_as_default?: boolean;
}

export interface RedirectTokenizationRequest {
  user_id: string;
  provider: PaymentProvider;
  return_url: string;
  set_as_default?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RedirectTokenizationResponse {
  session_id: string;
  redirect_url: string;
  expires_at: Timestamp;
}

// ==================== PAYMENT TYPES ====================

export interface PaymentRequest {
  payment_id: string;
  user_id: string;
  professional_id: string;
  service_request_id: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  token_id?: string; // For direct payments
  session_id?: string; // For redirect payments
  description: string;
  metadata?: Record<string, unknown>;
}

export interface Payment {
  payment_id: string;
  order_id: string;
  user_id: string;
  professional_id?: string; // ID del profesional que recibe el pago
  amount: number;
  total_amount?: number; // Monto total que paga el cliente (incluyendo comisión)
  commission_amount?: number; // Comisión de la plataforma
  currency: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  transaction_id?: string;
  
  // Información desnormalizada para rendimiento
  service_name?: string; // Nombre del servicio
  service_title?: string; // Título del servicio (alternativo)
  client_name?: string; // Nombre del cliente
  client_email?: string; // Email del cliente
  
  // Estados y disponibilidad para retiros
  withdrawal_status?: 'pending' | 'processing' | 'completed';
  available_for_withdrawal?: boolean;
  
  // Timestamps
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at?: Timestamp;
}

export interface PaymentDetail {
  detail_id: string;
  payment_id: string;
  order_id: string;
  service_charge: number;
  platform_fee: number;
  professional_amount: number;
  created_at: Timestamp;
}

export type PaymentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "refunded";

export interface PaymentMethodDetails {
  card_last4: string;
  card_brand: string;
  card_exp_month: number;
  card_exp_year: number;
}

// ==================== WEBHOOK TYPES ====================

export interface WebhookEvent {
  event_id: string;
  provider: PaymentProvider;
  event_type: string;
  payload: Record<string, unknown>;
  signature?: string;
  processed: boolean;
  created_at: Timestamp;
  processed_at?: Timestamp;
}

// ==================== TOKENIZATION SESSION TYPES ====================

export interface TokenizationSession {
  session_id: string;
  user_id: string;
  provider: PaymentProvider;
  status: "pending" | "completed" | "failed" | "expired";
  redirect_url?: string;
  return_url: string;
  token_id?: string;
  error_message?: string;
  created_at: Timestamp;
  expires_at: Timestamp;
  completed_at?: Timestamp;
  metadata?: Record<string, unknown>;
}

// ==================== API RESPONSE TYPES ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface TokenizationSuccessResponse {
  token_id: string;
  card_last4: string;
  card_brand: string;
  card_exp_month: number;
  card_exp_year: number;
  is_default: boolean;
}

export interface PaymentSuccessResponse {
  payment_id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  provider_payment_id?: string;
}

// ==================== ERROR TYPES ====================

export class PaymentGatewayError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = "PAYMENT_ERROR",
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PaymentGatewayError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
