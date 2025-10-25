/**
 * Stripe Payment Provider
 * Handles tokenization and payments through Stripe
 */

import Stripe from "stripe";
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

export class StripeProvider {
  name: PaymentProvider = "stripe";
  private stripe!: Stripe;
  private webhookSecret: string = "";

  initialize(config: Record<string, any>): void {
    let apiKey: string;
    
    if (config && config.secretKey) {
      apiKey = config.secretKey;
      this.webhookSecret = config.webhookSecret || "";
    } else {
      // Stripe requires actual API keys, cannot provide working defaults
      // Log warning and throw error with helpful message
      console.warn("No Stripe configuration provided. Stripe requires valid API keys from your Stripe dashboard.");
      throw new PaymentGatewayError(
        "Stripe API key is required. Please provide your Stripe test API key from your Stripe dashboard.",
        "MISSING_CONFIG"
      );
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: "2023-08-16",
    });
  }

  async tokenizeDirect(request: DirectTokenizationRequest): Promise<TokenizationSuccessResponse> {
    try {
      // Create a PaymentMethod with the card information
      const paymentMethod = await this.stripe.paymentMethods.create({
        type: "card",
        card: {
          number: request.card_number,
          exp_month: request.card_exp_month,
          exp_year: request.card_exp_year,
          cvc: request.card_cvv,
        },
        billing_details: {
          name: request.card_holder_name,
        },
      });

      // Create customer if needed
      const customers = await this.stripe.customers.search({
        query: `metadata['user_id']:'${request.user_id}'`,
      });

      let customer: Stripe.Customer;
      if (customers.data.length > 0) {
        customer = customers.data[0];
      } else {
        customer = await this.stripe.customers.create({
          metadata: {
            user_id: request.user_id,
          },
        });
      }

      // Attach PaymentMethod to customer
      await this.stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customer.id,
      });

      // Set as default if requested
      if (request.set_as_default) {
        await this.stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: paymentMethod.id,
          },
        });
      }

      // Save to Firestore
      const cardId = admin.firestore().collection("payment_cards").doc().id;
      const cardData: PaymentCard = {
        card_id: cardId,
        user_id: request.user_id,
        card_holder_name: request.card_holder_name,
        card_last_four: paymentMethod.card?.last4 || "",
        card_brand: this.mapStripeBrand(paymentMethod.card?.brand || ""),
        card_type: this.mapStripeCardType(paymentMethod.card?.funding || ""),
        expiration_month: paymentMethod.card?.exp_month || 0,
        expiration_year: paymentMethod.card?.exp_year || 0,
        is_default: request.set_as_default || false,
        payment_token: paymentMethod.id,
        // Stripe tokens no expiran, pero se pueden revocar
        token_expires_at: undefined,
        // Stripe no requiere CVC para pagos futuros con saved cards
        requires_cvv_for_payments: false,
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
        userCards.docs.forEach((doc) => {
          batch.update(doc.ref, { is_default: false, updated_at: Timestamp.now() });
        });
        await batch.commit();
      }

      return {
        token_id: paymentMethod.id,
        card_last4: paymentMethod.card?.last4 || "",
        card_brand: paymentMethod.card?.brand || "",
        card_exp_month: paymentMethod.card?.exp_month || 0,
        card_exp_year: paymentMethod.card?.exp_year || 0,
        is_default: request.set_as_default || false,
      };
    } catch (error: any) {
      console.error("Stripe tokenization error:", error);
      throw new PaymentGatewayError(
        `Stripe tokenization failed: ${error.message}`,
        "TOKENIZATION_FAILED"
      );
    }
  }

  async createTokenizationSession(
    request: RedirectTokenizationRequest
  ): Promise<RedirectTokenizationResponse> {
    try {
      // Create a Stripe Checkout session for card collection
      const session = await this.stripe.checkout.sessions.create({
        mode: "setup",
        success_url: `${request.return_url}?session_id={CHECKOUT_SESSION_ID}&success=true`,
        cancel_url: `${request.return_url}?session_id={CHECKOUT_SESSION_ID}&success=false`,
        metadata: {
          user_id: request.user_id,
          set_as_default: request.set_as_default?.toString() || "false",
        },
      });

      return {
        session_id: session.id,
        redirect_url: session.url || "",
        expires_at: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)), // 24 hours
      };
    } catch (error: any) {
      throw new PaymentGatewayError(
        `Stripe session creation failed: ${error.message}`,
        "SESSION_CREATION_FAILED"
      );
    }
  }

  async completeTokenization(
    sessionId: string,
    _callbackData: unknown
  ): Promise<TokenizationSuccessResponse> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      
      if (!session.setup_intent) {
        throw new PaymentGatewayError("Setup intent not found", "INVALID_SESSION");
      }

      const setupIntent = await this.stripe.setupIntents.retrieve(session.setup_intent as string);
      
      if (!setupIntent.payment_method) {
        throw new PaymentGatewayError("Payment method not found", "INVALID_SESSION");
      }

      const paymentMethod = await this.stripe.paymentMethods.retrieve(
        setupIntent.payment_method as string
      );

      const userId = session.metadata?.user_id;
      const setAsDefault = session.metadata?.set_as_default === "true";

      if (!userId) {
        throw new PaymentGatewayError("User ID not found in session", "INVALID_SESSION");
      }

      // Save to Firestore
      const cardId = admin.firestore().collection("payment_cards").doc().id;
      const cardData: PaymentCard = {
        card_id: cardId,
        user_id: userId,
        card_holder_name: paymentMethod.billing_details.name || "",
        card_last_four: paymentMethod.card?.last4 || "",
        card_brand: this.mapStripeBrand(paymentMethod.card?.brand || ""),
        card_type: this.mapStripeCardType(paymentMethod.card?.funding || ""),
        expiration_month: paymentMethod.card?.exp_month || 0,
        expiration_year: paymentMethod.card?.exp_year || 0,
        is_default: setAsDefault,
        payment_token: paymentMethod.id,
        // Stripe tokens no expiran, pero se pueden revocar
        token_expires_at: undefined,
        // Stripe no requiere CVC para pagos futuros con saved cards
        requires_cvv_for_payments: false,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      };

      await admin.firestore().collection("payment_cards").doc(cardId).set(cardData);

      // Update other cards to not be default if this one is set as default
      if (setAsDefault) {
        const userCards = await admin
          .firestore()
          .collection("payment_cards")
          .where("user_id", "==", userId)
          .where("card_id", "!=", cardId)
          .get();

        const batch = admin.firestore().batch();
        userCards.docs.forEach((doc) => {
          batch.update(doc.ref, { is_default: false, updated_at: Timestamp.now() });
        });
        await batch.commit();
      }

      return {
        token_id: paymentMethod.id,
        card_last4: paymentMethod.card?.last4 || "",
        card_brand: paymentMethod.card?.brand || "",
        card_exp_month: paymentMethod.card?.exp_month || 0,
        card_exp_year: paymentMethod.card?.exp_year || 0,
        is_default: setAsDefault,
      };
    } catch (error: any) {
      console.error("Stripe tokenization completion error:", error);
      throw new PaymentGatewayError(
        `Stripe tokenization completion failed: ${error.message}`,
        "TOKENIZATION_COMPLETION_FAILED"
      );
    }
  }

  async processPayment(payment: PaymentRequest, token: CardToken): Promise<PaymentSuccessResponse> {
    try {
      // Create PaymentIntent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(payment.amount * 100), // Convert to cents
        currency: payment.currency.toLowerCase(),
        payment_method: token.token_id,
        confirm: true,
        description: payment.description,
        metadata: {
          payment_id: payment.payment_id,
          user_id: payment.user_id,
          professional_id: payment.professional_id,
        },
        return_url: "https://your-app.com/return", // Required for some payment methods
      });

      return {
        payment_id: payment.payment_id,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: payment.amount,
        currency: payment.currency,
        provider_payment_id: paymentIntent.id,
      };
    } catch (error: any) {
      console.error("Stripe payment processing error:", error);
      throw new PaymentGatewayError(
        `Stripe payment processing failed: ${error.message}`,
        "PAYMENT_FAILED"
      );
    }
  }

  verifyWebhook(payload: string, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return true;
    } catch (error) {
      console.error("Stripe webhook verification failed:", error);
      return false;
    }
  }

  async handleWebhook(event: any): Promise<void> {
    try {
      switch (event.type) {
        case "payment_intent.succeeded":
          await this.handlePaymentSucceeded(event.data.object);
          break;
        case "payment_intent.payment_failed":
          await this.handlePaymentFailed(event.data.object);
          break;
        default:
          console.log(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (error) {
      console.error("Stripe webhook handling error:", error);
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<void> {
    try {
      await this.stripe.refunds.create({
        payment_intent: paymentId,
        amount: amount ? Math.round(amount * 100) : undefined,
      });
    } catch (error: any) {
      throw new PaymentGatewayError(
        `Stripe refund failed: ${error.message}`,
        "REFUND_FAILED"
      );
    }
  }

  async getPaymentStatus(providerPaymentId: string): Promise<Payment> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(providerPaymentId);
      
      // This is a simplified version - you'd need to adapt based on your Payment interface
      return {
        payment_id: paymentIntent.metadata.payment_id || "",
        order_id: paymentIntent.metadata.order_id || "",
        user_id: paymentIntent.metadata.user_id || "",
        professional_id: paymentIntent.metadata.professional_id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        payment_method: "card",
        status: this.mapStripeStatus(paymentIntent.status),
        transaction_id: paymentIntent.id,
        created_at: Timestamp.fromDate(new Date(paymentIntent.created * 1000)),
        updated_at: Timestamp.now(),
      };
    } catch (error: any) {
      throw new PaymentGatewayError(
        `Failed to get Stripe payment status: ${error.message}`,
        "STATUS_CHECK_FAILED"
      );
    }
  }

  private mapStripeBrand(brand: string): "visa" | "mastercard" | "amex" | "other" {
    switch (brand.toLowerCase()) {
      case "visa":
        return "visa";
      case "mastercard":
        return "mastercard";
      case "amex":
        return "amex";
      default:
        return "other";
    }
  }

  private mapStripeCardType(funding: string): "credit" | "debit" {
    return funding === "debit" ? "debit" : "credit";
  }

  private mapStripeStatus(status: string): "pending" | "processing" | "completed" | "failed" | "cancelled" | "refunded" {
    switch (status) {
      case "succeeded":
        return "completed";
      case "processing":
        return "processing";
      case "requires_payment_method":
      case "requires_confirmation":
      case "requires_action":
        return "pending";
      case "canceled":
        return "cancelled";
      case "payment_failed":
        return "failed";
      default:
        return "pending";
    }
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // Update payment status in Firestore
    const paymentId = paymentIntent.metadata.payment_id;
    if (paymentId) {
      await admin.firestore().collection("payments").doc(paymentId).update({
        status: "completed",
        completed_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      });
    }
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // Update payment status in Firestore
    const paymentId = paymentIntent.metadata.payment_id;
    if (paymentId) {
      await admin.firestore().collection("payments").doc(paymentId).update({
        status: "failed",
        updated_at: Timestamp.now(),
      });
    }
  }
}
