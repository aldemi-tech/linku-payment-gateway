/**
 * Transbank Payment Provider (Simplified Implementation)
 * Handles tokenization and payments through Transbank OneClick
 */

import { Timestamp } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
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
  PaymentGatewayError,
  PaymentCard,
} from "../types";

// Import Transbank SDK - Using require due to SDK compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OneClick, IntegrationCommerceCodes, IntegrationApiKeys } = require("transbank-sdk");
import { TRANSBANK_TEST_CONFIG } from "../config/test-credentials";

export class TransbankProvider {
  name: PaymentProvider = "transbank";
  private commerceCode: string = "";
  private apiKey: string = "";
  private environment: string = "integration"; // "integration" or "production"

  initialize(config: Record<string, any>): void {
    // Use provided config or fall back to test credentials
    if (config && Object.keys(config).length > 0) {
      this.commerceCode = config.commerceCode;
      this.apiKey = config.apiKey;
      this.environment = config.environment || "integration";
    } else {
      // Use default test credentials when no config is provided
      console.log("No Transbank configuration provided, using default test credentials");
      this.commerceCode = TRANSBANK_TEST_CONFIG.commerceCode;
      this.apiKey = TRANSBANK_TEST_CONFIG.apiKey;
      this.environment = TRANSBANK_TEST_CONFIG.environment;
    }

    // Fallback to SDK defaults if still empty
    if (!this.commerceCode) {
      this.commerceCode = IntegrationCommerceCodes.ONECLICK_MALL;
    }
    if (!this.apiKey) {
      this.apiKey = IntegrationApiKeys.WEBPAY;
    }

    // Configure Transbank SDK
    try {
      if (this.environment === "production") {
        OneClick.configureForProduction(this.commerceCode, this.apiKey);
      } else {
        // Use integration configuration with default values
        OneClick.configureForIntegration(
          this.commerceCode,
          this.apiKey
        );
      }
    } catch (error) {
      console.warn("Failed to configure Transbank SDK, using default integration settings:", error);
      // Fallback to default integration settings
      OneClick.configureForIntegration(
        IntegrationCommerceCodes.ONECLICK_MALL,
        IntegrationApiKeys.WEBPAY
      );
    }
  }

  async tokenizeDirect(_request: DirectTokenizationRequest): Promise<TokenizationSuccessResponse> {
    throw new PaymentGatewayError(
      "Transbank OneClick requires redirect tokenization",
      "METHOD_NOT_SUPPORTED"
    );
  }

  async createTokenizationSession(
    request: RedirectTokenizationRequest
  ): Promise<RedirectTokenizationResponse> {
    try {
      const username = `user_${request.user_id}_${Date.now()}`;
      const email = request.metadata?.email || `${username}@example.com`;

      // Create inscription with Transbank OneClick
      const response = await OneClick.MallInscription.start(
        username,
        email,
        request.return_url
      );

      // Save session to Firestore
      const sessionId = `tbk_${response.token}`;
      const sessionData = {
        session_id: sessionId,
        user_id: request.user_id,
        provider: this.name,
        status: "pending",
        redirect_url: response.urlWebpay,
        return_url: request.return_url,
        token: response.token,
        username: username,
        email: email,
        set_as_default: request.set_as_default || false,
        created_at: Timestamp.now(),
        expires_at: Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000)), // 30 minutes
        metadata: request.metadata,
      };

      await admin.firestore().collection("tokenization_sessions").doc(sessionId).set(sessionData);

      return {
        session_id: sessionId,
        redirect_url: response.urlWebpay,
        expires_at: sessionData.expires_at,
      };
    } catch (error: any) {
      console.error("Transbank session creation error:", error);
      throw new PaymentGatewayError(
        `Transbank session creation failed: ${error.message}`,
        "SESSION_CREATION_FAILED"
      );
    }
  }

  async completeTokenization(
    sessionId: string,
    callbackData: any
  ): Promise<TokenizationSuccessResponse> {
    try {
      // Get session from Firestore
      const sessionDoc = await admin.firestore().collection("tokenization_sessions").doc(sessionId).get();

      if (!sessionDoc.exists) {
        throw new PaymentGatewayError("Tokenization session not found", "SESSION_NOT_FOUND");
      }

      const session = sessionDoc.data();
      if (!session) {
        throw new PaymentGatewayError("Invalid session data", "INVALID_SESSION");
      }

      if (session.status !== "pending") {
        throw new PaymentGatewayError("Session already processed", "SESSION_ALREADY_PROCESSED");
      }

      // Complete inscription with Transbank
      const token = callbackData.TBK_TOKEN || session.token;
      const response = await OneClick.MallInscription.finish(token);

      if (response.responseCode !== 0) {
        throw new PaymentGatewayError(
          `Transbank inscription failed: ${response.responseCode}`,
          "INSCRIPTION_FAILED"
        );
      }

      // Save to Firestore payment_cards
      const cardId = admin.firestore().collection("payment_cards").doc().id;
      const cardData: PaymentCard = {
        card_id: cardId,
        user_id: session.user_id,
        card_holder_name: session.email,
        card_last_four: response.cardDetail?.cardNumber?.slice(-4) || "****",
        card_brand: this.mapTransbankCardType(response.cardDetail?.cardNumber),
        card_type: "credit", // Transbank doesn't distinguish in OneClick
        expiration_month: 12, // Transbank doesn't provide expiration in OneClick
        expiration_year: 2099,
        is_default: session.set_as_default || false,
        payment_token: response.tbkUser,
        // Transbank OneClick tokens pueden requerir renovación periódica
        // Típicamente duran 1 año desde la inscripción
        token_expires_at: Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        // Transbank NO requiere CVC para pagos OneClick
        requires_cvv_for_payments: false,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      };

      await admin.firestore().collection("payment_cards").doc(cardId).set(cardData);

      // Update other cards to not be default if this one is set as default
      if (session.set_as_default) {
        const userCards = await admin
          .firestore()
          .collection("payment_cards")
          .where("user_id", "==", session.user_id)
          .where("card_id", "!=", cardId)
          .get();

        const batch = admin.firestore().batch();
        for (const doc of userCards.docs) {
          batch.update(doc.ref, { is_default: false, updated_at: Timestamp.now() });
        }
        await batch.commit();
      }

      // Update session status
      await admin.firestore().collection("tokenization_sessions").doc(sessionId).update({
        status: "completed",
        token_id: response.tbkUser,
        completed_at: Timestamp.now(),
        card_detail: response.cardDetail,
      });

      return {
        token_id: response.tbkUser,
        card_last4: response.cardDetail?.cardNumber?.slice(-4) || "****",
        card_brand: this.mapTransbankCardType(response.cardDetail?.cardNumber) || "other",
        card_exp_month: 12,
        card_exp_year: 2099,
        is_default: session.set_as_default || false,
      };
    } catch (error: any) {
      console.error("Transbank tokenization completion error:", error);
      
      // Update session to failed
      try {
        await admin.firestore().collection("tokenization_sessions").doc(sessionId).update({
          status: "failed",
          error_message: error.message,
          completed_at: Timestamp.now(),
        });
      } catch (updateError) {
        console.error("Failed to update session status:", updateError);
      }

      throw new PaymentGatewayError(
        `Transbank tokenization completion failed: ${error.message}`,
        "TOKENIZATION_COMPLETION_FAILED"
      );
    }
  }

  async processPayment(payment: PaymentRequest, token: CardToken): Promise<PaymentSuccessResponse> {
    try {
      // Get payment card from Firestore to get the tbk_user token
      const cardDoc = await admin
        .firestore()
        .collection("payment_cards")
        .where("payment_token", "==", token.token_id)
        .limit(1)
        .get();

      if (cardDoc.empty) {
        throw new PaymentGatewayError("Payment card not found", "CARD_NOT_FOUND");
      }

      const cardData = cardDoc.docs[0].data() as PaymentCard;
      const tbkUser = cardData.payment_token;

      if (!tbkUser) {
        throw new PaymentGatewayError("Invalid payment token", "INVALID_TOKEN");
      }

      // Process payment with Transbank OneClick
      const response = await OneClick.MallTransaction.authorize(
        payment.user_id, // username
        tbkUser,
        payment.payment_id, // buyOrder
        [
          {
            commerce_code: this.commerceCode,
            buy_order: payment.payment_id,
            amount: Math.round(payment.amount),
            installments_number: 1,
          },
        ]
      );

      if (!response.details || response.details.length === 0) {
        throw new PaymentGatewayError("No payment details in response", "INVALID_RESPONSE");
      }

      const paymentDetail = response.details[0];
      const isSuccess = paymentDetail.response_code === 0;

      return {
        payment_id: payment.payment_id,
        status: isSuccess ? "completed" : "failed",
        amount: payment.amount,
        currency: payment.currency,
        provider_payment_id: paymentDetail.authorization_code || response.buy_order,
      };
    } catch (error: any) {
      console.error("Transbank payment processing error:", error);
      throw new PaymentGatewayError(
        `Transbank payment processing failed: ${error.message}`,
        "PAYMENT_FAILED"
      );
    }
  }

  verifyWebhook(payload: string, signature: string): boolean {
    // Transbank typically uses IP whitelist instead of signature verification
    // In production, verify the request comes from Transbank's IP addresses
    // For now, we'll implement basic validation
    try {
      return payload.length > 0 && signature.length >= 0; // Basic validation
    } catch (error) {
      console.error("Transbank webhook verification failed:", error);
      return false;
    }
  }

  async handleWebhook(event: any): Promise<void> {
    try {
      console.log("Handling Transbank webhook event:", event);
      // Handle different Transbank webhook events
      // Implementation depends on the specific webhooks Transbank sends
    } catch (error) {
      console.error("Transbank webhook handling error:", error);
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<void> {
    try {
      // Get payment details from Firestore
      const paymentDoc = await admin.firestore().collection("payments").doc(paymentId).get();
      
      if (!paymentDoc.exists) {
        throw new PaymentGatewayError("Payment not found", "PAYMENT_NOT_FOUND");
      }

      const paymentData = paymentDoc.data() as Payment;
      
      if (!paymentData.transaction_id) {
        throw new PaymentGatewayError("No transaction ID found for refund", "NO_TRANSACTION_ID");
      }

      // Process refund with Transbank
      const response = await OneClick.MallTransaction.refund(
        paymentData.transaction_id, // token from original transaction
        paymentData.payment_id, // buyOrder
        this.commerceCode,
        amount || paymentData.amount
      );

      if (response.response_code !== 0) {
        throw new PaymentGatewayError(
          `Refund failed with code: ${response.response_code}`,
          "REFUND_FAILED"
        );
      }

    } catch (error: any) {
      throw new PaymentGatewayError(
        `Transbank refund failed: ${error.message}`,
        "REFUND_FAILED"
      );
    }
  }

  async getPaymentStatus(providerPaymentId: string): Promise<Payment> {
    try {
      // Get payment status from Transbank
      const response = await OneClick.MallTransaction.status(providerPaymentId);
      
      return {
        payment_id: response.buy_order || "",
        order_id: response.buy_order || "",
        user_id: "", // Would need to be stored separately
        amount: response.amount / 100, // Convert from cents
        currency: "CLP", // Transbank is Chilean pesos
        payment_method: "card",
        status: this.mapTransbankStatus(response.status),
        transaction_id: providerPaymentId,
        created_at: Timestamp.now(), // Would need actual date from Transbank
        updated_at: Timestamp.now(),
      };
    } catch (error: any) {
      throw new PaymentGatewayError(
        `Failed to get Transbank payment status: ${error.message}`,
        "STATUS_CHECK_FAILED"
      );
    }
  }

  private mapTransbankCardType(cardNumber?: string): "visa" | "mastercard" | "amex" | "other" {
    if (!cardNumber) return "other";
    
    const firstDigit = cardNumber.charAt(0);
    const firstTwoDigits = cardNumber.substring(0, 2);
    
    if (firstDigit === "4") {
      return "visa";
    } else if (["51", "52", "53", "54", "55"].includes(firstTwoDigits)) {
      return "mastercard";
    } else if (["34", "37"].includes(firstTwoDigits)) {
      return "amex";
    }
    
    return "other";
  }

  private mapTransbankStatus(status: string): "pending" | "processing" | "completed" | "failed" | "cancelled" | "refunded" {
    switch (status) {
      case "AUTHORIZED":
        return "completed";
      case "FAILED":
        return "failed";
      case "NULLIFIED":
        return "cancelled";
      case "REVERSED":
        return "refunded";
      default:
        return "pending";
    }
  }
}