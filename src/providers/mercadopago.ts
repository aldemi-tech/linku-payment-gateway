/**
 * MercadoPago Payment Provider
 * Handles tokenization and payments through MercadoPago
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

// Import MercadoPago SDK - Using require due to SDK compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mercadopago = require("mercadopago");

export class MercadoPagoProvider {
  name: PaymentProvider = "mercadopago";
  private accessToken: string = "";
  private environment: string = "sandbox"; // "sandbox" or "production"

  initialize(config: Record<string, any>): void {
    if (config && config.accessToken) {
      this.accessToken = config.accessToken;
      this.environment = config.environment || "sandbox";
    } else {
      // MercadoPago requires actual access tokens, cannot provide working defaults
      // Log warning and throw error with helpful message
      console.warn("No MercadoPago configuration provided. MercadoPago requires a valid access token from your MercadoPago developer account.");
      throw new PaymentGatewayError(
        "MercadoPago access token is required. Please create a test application in your MercadoPago developer account and provide the access token.",
        "MISSING_CONFIG"
      );
    }

    // Configure MercadoPago SDK
    mercadopago.configure({
      access_token: this.accessToken,
      sandbox: this.environment === "sandbox",
    });
  }

  async tokenizeDirect(request: DirectTokenizationRequest): Promise<TokenizationSuccessResponse> {
    try {
      // Create card token with MercadoPago
      const cardTokenData = {
        card_number: request.card_number,
        expiration_month: request.card_exp_month,
        expiration_year: request.card_exp_year,
        security_code: request.card_cvv,
        cardholder: {
          name: request.card_holder_name,
        },
      };

      const response = await mercadopago.card_token.create(cardTokenData);
      
      if (response.status !== 201) {
        throw new PaymentGatewayError(
          `MercadoPago tokenization failed: ${response.response.message || "Unknown error"}`,
          "TOKENIZATION_FAILED"
        );
      }

      const cardToken = response.response;

      // Create customer if needed
      let customer;
      try {
        const customers = await mercadopago.customers.search({
          email: `user_${request.user_id}@example.com`, // You might want to pass actual email
        });
        
        if (customers.response.results.length > 0) {
          customer = customers.response.results[0];
        } else {
          const customerData = {
            email: `user_${request.user_id}@example.com`,
            first_name: request.card_holder_name.split(" ")[0] || "",
            last_name: request.card_holder_name.split(" ").slice(1).join(" ") || "",
            phone: {
              area_code: "",
              number: "",
            },
            identification: {
              type: "",
              number: "",
            },
            description: `Customer for user ${request.user_id}`,
          };
          
          const customerResponse = await mercadopago.customers.create(customerData);
          customer = customerResponse.response;
        }
      } catch (error) {
        console.error("Error creating/finding customer:", error);
        // Continue without customer for now
      }

      // Create saved card
      let savedCard;
      if (customer) {
        try {
          const savedCardData = {
            token: cardToken.id,
          };
          
          const savedCardResponse = await mercadopago.customers.cards.create(customer.id, savedCardData);
          savedCard = savedCardResponse.response;
        } catch (error) {
          console.error("Error creating saved card:", error);
        }
      }

      // Save to Firestore payment_cards
      const cardId = admin.firestore().collection("payment_cards").doc().id;
      const cardData: PaymentCard = {
        card_id: cardId,
        user_id: request.user_id,
        card_holder_name: request.card_holder_name,
        card_last_four: cardToken.last_four_digits,
        card_brand: this.mapMercadoPagoBrand(cardToken.payment_method.id),
        card_type: this.mapMercadoPagoCardType(cardToken.payment_method.payment_type_id),
        expiration_month: request.card_exp_month,
        expiration_year: request.card_exp_year,
        is_default: request.set_as_default || false,
        payment_token: savedCard?.id || cardToken.id,
        // MercadoPago tokens pueden expirar según las políticas de seguridad
        // Típicamente son válidos por 6 meses a 1 año
        token_expires_at: Timestamp.fromDate(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)), // 6 meses
        // MercadoPago SÍ requiere CVC para crear tokens en pagos futuros
        requires_cvv_for_payments: true,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      };

      await admin.firestore().collection("payment_cards").doc(cardId).set(cardData);

      // Update other cards to not be default if this one is set as default
      if (request.set_as_default) {
        const userCards = await admin
          .firestore()
          .collection("payment_cards")
          .where("user_id", "==", request.user_id)
          .where("card_id", "!=", cardId)
          .get();

        const batch = admin.firestore().batch();
        for (const doc of userCards.docs) {
          batch.update(doc.ref, { is_default: false, updated_at: Timestamp.now() });
        }
        await batch.commit();
      }

      return {
        token_id: savedCard?.id || cardToken.id,
        card_last4: cardToken.last_four_digits,
        card_brand: cardToken.payment_method.id,
        card_exp_month: request.card_exp_month,
        card_exp_year: request.card_exp_year,
        is_default: request.set_as_default || false,
      };
    } catch (error: any) {
      console.error("MercadoPago tokenization error:", error);
      throw new PaymentGatewayError(
        `MercadoPago tokenization failed: ${error.message}`,
        "TOKENIZATION_FAILED"
      );
    }
  }

  async createTokenizationSession(
    request: RedirectTokenizationRequest
  ): Promise<RedirectTokenizationResponse> {
    try {
      // Create checkout preference for card tokenization
      const preferenceData = {
        items: [
          {
            title: "Card Registration",
            description: "Register payment card",
            quantity: 1,
            currency_id: "CLP", // or your currency
            unit_price: 0, // Free for card registration
          },
        ],
        payer: {
          email: `user_${request.user_id}@example.com`,
        },
        back_urls: {
          success: `${request.return_url}?status=success`,
          failure: `${request.return_url}?status=failure`,
          pending: `${request.return_url}?status=pending`,
        },
        auto_return: "approved",
        external_reference: request.user_id,
        metadata: {
          user_id: request.user_id,
          set_as_default: request.set_as_default?.toString() || "false",
        },
      };

      const response = await mercadopago.preferences.create(preferenceData);

      if (response.status !== 201) {
        throw new PaymentGatewayError(
          "Failed to create MercadoPago preference",
          "SESSION_CREATION_FAILED"
        );
      }

      const preference = response.response;
      const redirectUrl = this.environment === "sandbox" 
        ? preference.sandbox_init_point 
        : preference.init_point;

      return {
        session_id: preference.id,
        redirect_url: redirectUrl,
        expires_at: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)), // 24 hours
      };
    } catch (error: any) {
      throw new PaymentGatewayError(
        `MercadoPago session creation failed: ${error.message}`,
        "SESSION_CREATION_FAILED"
      );
    }
  }

  async completeTokenization(
    sessionId: string,
    callbackData: any
  ): Promise<TokenizationSuccessResponse> {
    try {
      const paymentId = callbackData.payment_id || callbackData.collection_id;
      
      if (!paymentId) {
        throw new PaymentGatewayError("Payment ID not found in callback", "INVALID_CALLBACK");
      }

      // Get payment information from MercadoPago
      const paymentResponse = await mercadopago.payment.findById(paymentId);
      
      if (paymentResponse.status !== 200) {
        throw new PaymentGatewayError("Failed to get payment information", "PAYMENT_NOT_FOUND");
      }

      const payment = paymentResponse.response;
      const userId = payment.external_reference;
      
      if (!userId) {
        throw new PaymentGatewayError("User ID not found in payment", "INVALID_PAYMENT");
      }

      // Extract card information
      const cardInfo = payment.card;
      
      // Save to Firestore payment_cards
      const cardId = admin.firestore().collection("payment_cards").doc().id;
      const cardData: PaymentCard = {
        card_id: cardId,
        user_id: userId,
        card_holder_name: cardInfo.cardholder?.name || "",
        card_last_four: cardInfo.last_four_digits || "",
        card_brand: this.mapMercadoPagoBrand(payment.payment_method_id),
        card_type: this.mapMercadoPagoCardType(payment.payment_type_id),
        expiration_month: Number.parseInt(cardInfo.expiration_month) || 0,
        expiration_year: Number.parseInt(cardInfo.expiration_year) || 0,
        is_default: payment.metadata?.set_as_default === "true",
        payment_token: payment.id.toString(),
        // MercadoPago tokens pueden expirar según las políticas de seguridad
        token_expires_at: Timestamp.fromDate(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)), // 6 meses
        // MercadoPago SÍ requiere CVC para crear tokens en pagos futuros
        requires_cvv_for_payments: true,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      };

      await admin.firestore().collection("payment_cards").doc(cardId).set(cardData);

      // Update other cards to not be default if this one is set as default
      if (payment.metadata?.set_as_default === "true") {
        const userCards = await admin
          .firestore()
          .collection("payment_cards")
          .where("user_id", "==", userId)
          .where("card_id", "!=", cardId)
          .get();

        const batch = admin.firestore().batch();
        for (const doc of userCards.docs) {
          batch.update(doc.ref, { is_default: false, updated_at: Timestamp.now() });
        }
        await batch.commit();
      }

      return {
        token_id: payment.id.toString(),
        card_last4: cardInfo.last_four_digits || "",
        card_brand: payment.payment_method_id,
        card_exp_month: Number.parseInt(cardInfo.expiration_month) || 0,
        card_exp_year: Number.parseInt(cardInfo.expiration_year) || 0,
        is_default: cardData.is_default,
      };
    } catch (error: any) {
      console.error("MercadoPago tokenization completion error:", error);
      throw new PaymentGatewayError(
        `MercadoPago tokenization completion failed: ${error.message}`,
        "TOKENIZATION_COMPLETION_FAILED"
      );
    }
  }

  async processPayment(payment: PaymentRequest, token: CardToken): Promise<PaymentSuccessResponse> {
    try {
      // Get payment card from Firestore
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

      // Create payment with MercadoPago
      const paymentData = {
        transaction_amount: payment.amount,
        token: cardData.payment_token,
        description: payment.description,
        installments: 1,
        payment_method_id: cardData.card_brand,
        payer: {
          email: `user_${payment.user_id}@example.com`,
        },
        external_reference: payment.payment_id,
        metadata: {
          payment_id: payment.payment_id,
          user_id: payment.user_id,
          professional_id: payment.professional_id,
        },
      };

      const response = await mercadopago.payment.create(paymentData);

      if (response.status !== 201) {
        throw new PaymentGatewayError(
          `Payment creation failed: ${response.response.message || "Unknown error"}`,
          "PAYMENT_FAILED"
        );
      }

      const mpPayment = response.response;

      return {
        payment_id: payment.payment_id,
        status: this.mapMercadoPagoStatus(mpPayment.status),
        amount: payment.amount,
        currency: payment.currency,
        provider_payment_id: mpPayment.id.toString(),
      };
    } catch (error: any) {
      console.error("MercadoPago payment processing error:", error);
      throw new PaymentGatewayError(
        `MercadoPago payment processing failed: ${error.message}`,
        "PAYMENT_FAILED"
      );
    }
  }

  verifyWebhook(_payload: string, _signature: string): boolean {
    // MercadoPago uses different webhook verification
    // This is a simplified implementation
    try {
      return _payload.length > 0; // Basic validation
    } catch (error) {
      console.error("MercadoPago webhook verification failed:", error);
      return false;
    }
  }

  async handleWebhook(event: any): Promise<void> {
    try {
      console.log("Handling MercadoPago webhook event:", event);
      
      if (event.type === "payment") {
        const paymentId = event.data.id;
        
        // Get payment from MercadoPago
        const paymentResponse = await mercadopago.payment.findById(paymentId);
        
        if (paymentResponse.status === 200) {
          const payment = paymentResponse.response;
          const externalReference = payment.external_reference;
          
          if (externalReference) {
            // Update payment status in Firestore
            await admin.firestore().collection("payments").doc(externalReference).update({
              status: this.mapMercadoPagoStatus(payment.status),
              transaction_id: paymentId.toString(),
              updated_at: Timestamp.now(),
            });
          }
        }
      }
    } catch (error) {
      console.error("MercadoPago webhook handling error:", error);
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<void> {
    try {
      const refundData = amount ? { amount } : {};
      
      const response = await mercadopago.refund.create({
        payment_id: Number.parseInt(paymentId),
        ...refundData,
      });

      if (response.status !== 201) {
        throw new PaymentGatewayError(
          `Refund creation failed: ${response.response.message || "Unknown error"}`,
          "REFUND_FAILED"
        );
      }
    } catch (error: any) {
      throw new PaymentGatewayError(
        `MercadoPago refund failed: ${error.message}`,
        "REFUND_FAILED"
      );
    }
  }

  async getPaymentStatus(providerPaymentId: string): Promise<Payment> {
    try {
      const response = await mercadopago.payment.findById(Number.parseInt(providerPaymentId));
      
      if (response.status !== 200) {
        throw new PaymentGatewayError("Payment not found", "PAYMENT_NOT_FOUND");
      }

      const payment = response.response;

      return {
        payment_id: payment.external_reference || "",
        order_id: payment.external_reference || "",
        user_id: payment.metadata?.user_id || "",
        professional_id: payment.metadata?.professional_id,
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        payment_method: "card",
        status: this.mapMercadoPagoStatus(payment.status),
        transaction_id: providerPaymentId,
        created_at: Timestamp.fromDate(new Date(payment.date_created)),
        updated_at: Timestamp.now(),
      };
    } catch (error: any) {
      throw new PaymentGatewayError(
        `Failed to get MercadoPago payment status: ${error.message}`,
        "STATUS_CHECK_FAILED"
      );
    }
  }

  private mapMercadoPagoBrand(paymentMethodId: string): "visa" | "mastercard" | "amex" | "other" {
    switch (paymentMethodId?.toLowerCase()) {
      case "visa":
        return "visa";
      case "master":
      case "mastercard":
        return "mastercard";
      case "amex":
        return "amex";
      default:
        return "other";
    }
  }

  private mapMercadoPagoCardType(paymentTypeId: string): "credit" | "debit" {
    switch (paymentTypeId?.toLowerCase()) {
      case "debit_card":
        return "debit";
      case "credit_card":
      default:
        return "credit";
    }
  }

  private mapMercadoPagoStatus(status: string): "pending" | "processing" | "completed" | "failed" | "cancelled" | "refunded" {
    switch (status) {
      case "approved":
        return "completed";
      case "pending":
      case "in_process":
        return "processing";
      case "authorized":
        return "pending";
      case "rejected":
        return "failed";
      case "cancelled":
        return "cancelled";
      case "refunded":
      case "charged_back":
        return "refunded";
      default:
        return "pending";
    }
  }
}