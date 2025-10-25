/**
 * Payment Gateway Cloud Functions
 * Main entry point for all payment-related functions
 */

import * as functions from "firebase-functions";
import { PaymentProviderFactory } from "./providers/factory";
import {
  PaymentProvider,
  PaymentProviderConfig,
  DirectTokenizationRequest,
  RedirectTokenizationRequest,
  PaymentRequest,
  CardToken,
  ApiResponse,
  PaymentGatewayError,
  PaymentCard,
} from "./types";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Utility functions
const validateRequiredFields = (data: any, fields: string[]) => {
  const missing = fields.filter(field => !data[field]);
  if (missing.length > 0) {
    throw new PaymentGatewayError(
      `Missing required fields: ${missing.join(", ")}`,
      "VALIDATION_ERROR",
      400
    );
  }
};

const handleError = (error: any): PaymentGatewayError => {
  if (error instanceof PaymentGatewayError) {
    return error;
  }
  console.error("Unexpected error:", error);
  return new PaymentGatewayError(
    "An unexpected error occurred",
    "INTERNAL_ERROR",
    500,
    error
  );
};

const generateId = (prefix: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}_${timestamp}_${random}`;
};

const createTimestamp = () => Timestamp.now();

// Initialize providers on cold start
const initializeProviders = () => {
  const configs: PaymentProviderConfig[] = [];

  // Stripe configuration
  const stripeSecretKey = functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY;
  if (stripeSecretKey) {
    configs.push({
      provider: "stripe",
      method: "direct",
      publicKey: functions.config().stripe?.public_key || process.env.STRIPE_PUBLIC_KEY,
      secretKey: stripeSecretKey,
      webhookSecret: functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET,
      enabled: true,
    });
    console.log("Stripe provider configuration added");
  } else {
    console.log("Stripe API key not found, skipping Stripe provider");
  }

  // Transbank configuration
  const transbankApiKey = functions.config().transbank?.api_key || process.env.TRANSBANK_API_KEY;
  if (transbankApiKey) {
    configs.push({
      provider: "transbank",
      method: "redirect",
      commerceCode: functions.config().transbank?.commerce_code || process.env.TRANSBANK_COMMERCE_CODE,
      apiKey: transbankApiKey,
      environment: functions.config().transbank?.environment || process.env.TRANSBANK_ENVIRONMENT || "integration",
      enabled: true,
    });
    console.log("Transbank provider configuration added");
  } else {
    console.log("Transbank API key not found, skipping Transbank provider");
  }

  // MercadoPago configuration
  const mercadoPagoAccessToken = functions.config().mercadopago?.access_token || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (mercadoPagoAccessToken) {
    configs.push({
      provider: "mercadopago",
      method: "direct",
      accessToken: mercadoPagoAccessToken,
      environment: functions.config().mercadopago?.environment || process.env.MERCADOPAGO_ENVIRONMENT || "sandbox",
      enabled: true,
    });
    console.log("MercadoPago provider configuration added");
  } else {
    console.log("MercadoPago access token not found, skipping MercadoPago provider");
  }

  PaymentProviderFactory.initialize(configs);
  console.log("Payment gateway initialized with providers:", {
    providers: PaymentProviderFactory.getAvailableProviders(),
    totalConfigs: configs.length
  });
};

// Initialize on module load
initializeProviders();

// ==================== TOKENIZATION FUNCTIONS ====================

/**
 * Tokenize card directly (for providers like Stripe)
 */
export const tokenizeCardDirect = functions.https.onCall(
  async (data: DirectTokenizationRequest, context): Promise<ApiResponse> => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new PaymentGatewayError("Unauthenticated", "UNAUTHENTICATED", 401);
      }

      // Validate user_id matches authenticated user
      if (data.user_id !== context.auth.uid) {
        throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
      }

      // Validate required fields
      validateRequiredFields(data, [
        "user_id",
        "provider",
        "card_number",
        "card_exp_month",
        "card_exp_year",
        "card_cvv",
        "card_holder_name",
      ]);

      console.log("Direct tokenization request", {
        user_id: data.user_id,
        provider: data.provider,
      });

      const provider = PaymentProviderFactory.getProvider(data.provider);
      const result = await provider.tokenizeDirect(data);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      const gatewayError = handleError(error);
      return {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
    }
  }
);

/**
 * Create tokenization session with redirect (for providers like Transbank)
 */
export const createTokenizationSession = functions.https.onCall(
  async (data: RedirectTokenizationRequest, context): Promise<ApiResponse> => {
    try {
      console.log("Create tokenization session request", data, context.rawRequest.headers);
      
      // Verify authentication
      if (!context.auth) {
        throw new PaymentGatewayError("Unauthenticated", "UNAUTHENTICATED", 401);
      }

      // Validate user_id matches authenticated user
      if (data.user_id !== context.auth.uid) {
        throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
      }

      // Validate required fields
      validateRequiredFields(data, ["user_id", "provider", "return_url"]);

      console.log("Creating tokenization session", {
        user_id: data.user_id,
        provider: data.provider,
      });

      const provider = PaymentProviderFactory.getProvider(data.provider);
      const result = await provider.createTokenizationSession(data);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      const gatewayError = handleError(error);
      return {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
    }
  }
);

/**
 * Complete tokenization from redirect callback
 */
export const completeTokenization = functions.https.onCall(
  async (data: { session_id: string; callback_data: any; provider: PaymentProvider }, context): Promise<ApiResponse> => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new PaymentGatewayError("Unauthenticated", "UNAUTHENTICATED", 401);
      }

      validateRequiredFields(data, ["session_id", "provider"]);

      console.log("Completing tokenization", {
        session_id: data.session_id,
        provider: data.provider,
      });

      // Verify session belongs to authenticated user
      const sessionDoc = await db.collection("tokenization_sessions").doc(data.session_id).get();
      
      if (!sessionDoc.exists) {
        throw new PaymentGatewayError("Session not found", "NOT_FOUND", 404);
      }

      const session = sessionDoc.data();
      if (session?.user_id !== context.auth.uid) {
        throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
      }

      const provider = PaymentProviderFactory.getProvider(data.provider);
      const result = await provider.completeTokenization(data.session_id, data.callback_data);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      const gatewayError = handleError(error);
      return {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
    }
  }
);

// ==================== PAYMENT FUNCTIONS ====================

/**
 * Process payment with tokenized card
 */
export const processPayment = functions.https.onCall(
  async (data: PaymentRequest, context): Promise<ApiResponse> => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new PaymentGatewayError("Unauthenticated", "UNAUTHENTICATED", 401);
      }

      // Validate user_id matches authenticated user
      if (data.user_id !== context.auth.uid) {
        throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
      }

      // Validate required fields
      validateRequiredFields(data, [
        "user_id",
        "professional_id",
        "service_request_id",
        "amount",
        "currency",
        "provider",
        "description",
      ]);

      // Require either token_id or session_id
      if (!data.token_id && !data.session_id) {
        throw new PaymentGatewayError(
          "Either token_id or session_id is required",
          "VALIDATION_ERROR",
          400
        );
      }

      console.log("Processing payment", {
        user_id: data.user_id,
        amount: data.amount,
        provider: data.provider,
      });

      // Get or create payment record
      const paymentId = data.payment_id || generateId("payment");
      const paymentData = {
        ...data,
        payment_id: paymentId,
        status: "processing" as const,
        created_at: createTimestamp(),
        updated_at: createTimestamp(),
      };

      await db.collection("payments").doc(paymentId).set(paymentData);

      // Get payment card
      let token: CardToken;
      
      if (data.token_id) {
        // Find card by card_id or payment_token
        let cardDoc = await db.collection("payment_cards").doc(data.token_id).get();
        
        if (!cardDoc.exists) {
          // Try to find by payment_token
          const cardsSnapshot = await db
            .collection("payment_cards")
            .where("payment_token", "==", data.token_id)
            .where("user_id", "==", data.user_id)
            .limit(1)
            .get();
          
          if (cardsSnapshot.empty) {
            throw new PaymentGatewayError("Payment card not found", "NOT_FOUND", 404);
          }
          
          cardDoc = cardsSnapshot.docs[0];
        }

        const paymentCard = cardDoc.data() as PaymentCard;

        // Verify card belongs to user
        if (paymentCard.user_id !== data.user_id) {
          throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
        }

        // Create compatible CardToken for provider
        token = {
          token_id: paymentCard.payment_token || paymentCard.card_id,
          user_id: paymentCard.user_id,
          provider: data.provider,
          card_last4: paymentCard.card_last_four,
          card_brand: paymentCard.card_brand,
          card_exp_month: paymentCard.expiration_month,
          card_exp_year: paymentCard.expiration_year,
          card_holder_name: paymentCard.card_holder_name,
          is_default: paymentCard.is_default,
          created_at: paymentCard.created_at,
          updated_at: paymentCard.updated_at,
        };
      } else {
        // TODO: Handle session_id case (get token from completed session)
        throw new PaymentGatewayError(
          "Session-based payments not yet implemented",
          "NOT_IMPLEMENTED",
          501
        );
      }

      // Process payment with provider
      const provider = PaymentProviderFactory.getProvider(data.provider);
      const result = await provider.processPayment(paymentData, token);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      const gatewayError = handleError(error);
      
      // Update payment status to failed if it exists
      if (data.payment_id) {
        await db.collection("payments").doc(data.payment_id).update({
          status: "failed",
          error_message: gatewayError.message,
          updated_at: createTimestamp(),
        }).catch(() => {
          // Ignore errors updating non-existent payment
        });
      }

      return {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
    }
  }
);

/**
 * Refund a payment
 */
export const refundPayment = functions.https.onCall(
  async (data: { payment_id: string; amount?: number }, context): Promise<ApiResponse> => {
    try {
      // Verify authentication
      if (!context.auth) {
        throw new PaymentGatewayError("Unauthenticated", "UNAUTHENTICATED", 401);
      }

      validateRequiredFields(data, ["payment_id"]);

      console.log("Refunding payment", { payment_id: data.payment_id });

      // Get payment
      const paymentDoc = await db.collection("payments").doc(data.payment_id).get();
      
      if (!paymentDoc.exists) {
        throw new PaymentGatewayError("Payment not found", "NOT_FOUND", 404);
      }

      const payment = paymentDoc.data() as PaymentRequest;

      // Verify user is authorized (either client or professional)
      if (payment.user_id !== context.auth.uid && payment.professional_id !== context.auth.uid) {
        throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
      }

      const provider = PaymentProviderFactory.getProvider(payment.provider);
      await provider.refundPayment(data.payment_id, data.amount);

      return {
        success: true,
        data: {
          message: "Payment refunded successfully",
          payment_id: data.payment_id,
        },
      };
    } catch (error: any) {
      const gatewayError = handleError(error);
      return {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
    }
  }
);

// ==================== WEBHOOK HANDLERS ====================

/**
 * Unified webhook handler for all payment providers
 * Route: /webhook/{provider} where provider is: stripe, transbank, mercadopago
 */
export const webhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Extract provider from URL path
    // URL: /webhook/stripe -> path = /webhook/stripe -> provider = stripe
    const pathParts = req.path.split("/");
    const provider = pathParts.at(-1)?.toLowerCase();

    if (!provider || !["stripe", "transbank", "mercadopago"].includes(provider)) {
      res.status(400).json({
        error: "Invalid provider. Use: /webhook/{stripe|transbank|mercadopago}"
      });
      return;
    }

    // Check if provider is available
    if (!PaymentProviderFactory.isProviderAvailable(provider as PaymentProvider)) {
      res.status(400).json({
        error: `Provider '${provider}' is not configured or available`
      });
      return;
    }

    const paymentProvider = PaymentProviderFactory.getProvider(provider as PaymentProvider);

    // Handle Stripe signature verification
    if (provider === "stripe") {
      const signature = req.headers["stripe-signature"] as string;
      const payload = JSON.stringify(req.body);

      if (!paymentProvider.verifyWebhook(payload, signature)) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }

    // Process webhook
    await paymentProvider.handleWebhook(req.body);

    console.log(`${provider} webhook processed successfully`);
    res.status(200).json({ 
      received: true, 
      provider: provider,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error(`Webhook processing error:`, {
      provider: req.path,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: "Webhook processing failed",
      message: error.message
    });
  }
});
