/**
 * Base Payment Provider Interface
 * All payment providers must implement this interface
 */

import {
  PaymentProvider,
  DirectTokenizationRequest,
  RedirectTokenizationRequest,
  RedirectTokenizationResponse,
  CardToken,
  PaymentRequest,
  Payment,
  TokenizationSuccessResponse,
  PaymentSuccessResponse,
} from "../types";

export interface IPaymentProvider {
  /**
   * Provider name
   */
  name: PaymentProvider;

  /**
   * Initialize provider with configuration
   */
  initialize(config: Record<string, any>): void;

  /**
   * Tokenize card directly (for providers like Stripe)
   * @throws Error if provider doesn't support direct tokenization
   */
  tokenizeDirect(request: DirectTokenizationRequest): Promise<TokenizationSuccessResponse>;

  /**
   * Create tokenization session with redirect (for providers like Transbank)
   * @throws Error if provider doesn't support redirect tokenization
   */
  createTokenizationSession(
    request: RedirectTokenizationRequest
  ): Promise<RedirectTokenizationResponse>;

  /**
   * Complete tokenization from redirect callback
   */
  completeTokenization(sessionId: string, callbackData: any): Promise<TokenizationSuccessResponse>;

  /**
   * Process a payment using a tokenized card
   */
  processPayment(payment: PaymentRequest, token: CardToken): Promise<PaymentSuccessResponse>;

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean;

  /**
   * Handle webhook event
   */
  handleWebhook(event: any): Promise<void>;

  /**
   * Refund a payment
   */
  refundPayment(paymentId: string, amount?: number): Promise<void>;

  /**
   * Get payment status from provider
   */
  getPaymentStatus(providerPaymentId: string): Promise<Payment>;
}
