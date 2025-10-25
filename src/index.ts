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
import { validateRequest } from "./utils";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Utility functions
const validateRequiredFields = (data: any, fields: string[]) => {
  const missing = fields.filter((field) => !data[field]);
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
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}_${timestamp}_${random}`;
};

const createTimestamp = () => Timestamp.now();

// Initialize providers on cold start
const initializeProviders = () => {
  const configs: PaymentProviderConfig[] = [];

  // Stripe configuration
  const stripeSecretKey =
    functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY;
  if (stripeSecretKey) {
    configs.push({
      provider: "stripe",
      method: "direct",
      publicKey:
        functions.config().stripe?.public_key || process.env.STRIPE_PUBLIC_KEY,
      secretKey: stripeSecretKey,
      webhookSecret:
        functions.config().stripe?.webhook_secret ||
        process.env.STRIPE_WEBHOOK_SECRET,
      enabled: true,
    });
    console.log("Stripe provider configuration added");
  } else {
    console.log("Stripe API key not found, will try to initialize with test credentials if available");
  }

  // Transbank configuration
  const transbankApiKey =
    functions.config().transbank?.api_key || process.env.TRANSBANK_API_KEY;
  if (transbankApiKey) {
    configs.push({
      provider: "transbank",
      method: "redirect",
      commerceCode:
        functions.config().transbank?.commerce_code ||
        process.env.TRANSBANK_COMMERCE_CODE,
      apiKey: transbankApiKey,
      environment:
        functions.config().transbank?.environment ||
        process.env.TRANSBANK_ENVIRONMENT ||
        "integration",
      enabled: true,
    });
    console.log("Transbank provider configuration added");
  } else {
    console.log("Transbank API key not found, will try to initialize with test credentials if available");
  }

  // MercadoPago configuration
  const mercadoPagoAccessToken =
    functions.config().mercadopago?.access_token ||
    process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (mercadoPagoAccessToken) {
    configs.push({
      provider: "mercadopago",
      method: "direct",
      accessToken: mercadoPagoAccessToken,
      environment:
        functions.config().mercadopago?.environment ||
        process.env.MERCADOPAGO_ENVIRONMENT ||
        "sandbox",
      enabled: true,
    });
    console.log("MercadoPago provider configuration added");
  } else {
    console.log("MercadoPago access token not found, will try to initialize with test credentials if available");
  }

  // Initialize providers (this will now also try test credentials for missing providers)
  PaymentProviderFactory.initialize(configs);
  console.log("Payment gateway initialized with providers:", {
    providers: PaymentProviderFactory.getAvailableProviders(),
    totalConfigs: configs.length,
    availableProviders: PaymentProviderFactory.getAvailableProviders().length,
  });
};

// Initialize on module load
initializeProviders();

// ==================== TOKENIZATION FUNCTIONS ====================

/**
 * Tokenize card directly (for providers like Stripe)
 */
export const tokenizeCardDirect = functions.https.onRequest(
  async (req, res) => {
    try {
      // Validate request method
      if (req.method !== 'POST') {
        res.status(405).json({ 
          success: false, 
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' } 
        });
        return;
      }

      // Validate authentication and user agent
      const { user, metadata } = await validateRequest(req);
      const data: DirectTokenizationRequest = req.body;

      // Validate user_id matches authenticated user
      if (data.user_id !== user.uid) {
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
        metadata: metadata,
      });

      const provider = PaymentProviderFactory.getProvider(data.provider);
      const result = await provider.tokenizeDirect(data);

      // Save tokenization session with metadata
      if (result.token_id) {
        await db.collection("tokenization_sessions").add({
          user_id: data.user_id,
          provider: data.provider,
          token_id: result.token_id,
          type: 'direct',
          status: 'completed',
          metadata: metadata,
          created_at: createTimestamp(),
        });
      }

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error: any) {
      const gatewayError = handleError(error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
      res.status(gatewayError.statusCode || 500).json(response);
    }
  }
);

/**
 * Create tokenization session with redirect (for providers like Transbank)
 */
export const createTokenizationSession = functions.https.onRequest(
  async (req, res) => {
    try {
      // Validate request method
      if (req.method !== 'POST') {
        res.status(405).json({ 
          success: false, 
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' } 
        });
        return;
      }

      // Validate authentication and user agent
      const { user, metadata } = await validateRequest(req);
      const data: RedirectTokenizationRequest = req.body;

      console.log(
        "Create tokenization session request",
        data,
        req.headers
      );

      // Validate user_id matches authenticated user
      if (data.user_id !== user.uid) {
        throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
      }

      // Validate required fields
      validateRequiredFields(data, ["user_id", "provider", "return_url"]);

      console.log("Creating tokenization session", {
        user_id: data.user_id,
        provider: data.provider,
        metadata: metadata,
      });

      const provider = PaymentProviderFactory.getProvider(data.provider);
      const result = await provider.createTokenizationSession(data);

      // Save tokenization session with metadata
      if (result.session_id) {
        await db.collection("tokenization_sessions").add({
          user_id: data.user_id,
          provider: data.provider,
          session_id: result.session_id,
          type: 'redirect',
          status: 'pending',
          return_url: data.return_url,
          metadata: metadata,
          created_at: createTimestamp(),
        });
      }

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error: any) {
      const gatewayError = handleError(error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
      res.status(gatewayError.statusCode || 500).json(response);
    }
  }
);

/**
 * Complete tokenization from redirect callback
 */
export const completeTokenization = functions.https.onRequest(
  async (req, res) => {
    try {
      // Validate request method
      if (req.method !== 'POST') {
        res.status(405).json({ 
          success: false, 
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' } 
        });
        return;
      }

      // Validate authentication and user agent
      const { user, metadata } = await validateRequest(req);
      const data: { session_id: string; callback_data: any; provider: PaymentProvider } = req.body;

      validateRequiredFields(data, ["session_id", "provider"]);

      console.log("Completing tokenization", {
        session_id: data.session_id,
        provider: data.provider,
        metadata: metadata,
      });

      // Verify session belongs to authenticated user
      const sessionQuery = await db
        .collection("tokenization_sessions")
        .where("session_id", "==", data.session_id)
        .limit(1)
        .get();

      if (sessionQuery.empty) {
        throw new PaymentGatewayError("Session not found", "NOT_FOUND", 404);
      }

      const sessionDoc = sessionQuery.docs[0];
      const session = sessionDoc.data();
      if (session?.user_id !== user.uid) {
        throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
      }

      const provider = PaymentProviderFactory.getProvider(data.provider);
      const result = await provider.completeTokenization(
        data.session_id,
        data.callback_data
      );

      // Update session with completion metadata
      await sessionDoc.ref.update({
        status: 'completed',
        completion_metadata: metadata,
        completed_at: createTimestamp(),
        token_id: result.token_id,
      });

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error: any) {
      const gatewayError = handleError(error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
      res.status(gatewayError.statusCode || 500).json(response);
    }
  }
);

// ==================== PAYMENT FUNCTIONS ====================

/**
 * Process payment with tokenized card
 */
export const processPayment = functions.https.onRequest(
  async (req, res) => {
    try {
      // Validate request method
      if (req.method !== 'POST') {
        res.status(405).json({ 
          success: false, 
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' } 
        });
        return;
      }

      // Validate authentication and user agent
      const { user, metadata } = await validateRequest(req);
      const data: PaymentRequest = req.body;

      // Validate user_id matches authenticated user
      if (data.user_id !== user.uid) {
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
        metadata: metadata,
      });

      // Get or create payment record
      const paymentId = data.payment_id || generateId("payment");
      const paymentData = {
        ...data,
        payment_id: paymentId,
        status: "processing" as const,
        metadata: metadata,
        created_at: createTimestamp(),
        updated_at: createTimestamp(),
      };

      await db.collection("payments").doc(paymentId).set(paymentData);

      // Get payment card
      let token: CardToken;

      if (data.token_id) {
        // Find card by card_id or payment_token
        let cardDoc = await db
          .collection("payment_cards")
          .doc(data.token_id)
          .get();

        if (!cardDoc.exists) {
          // Try to find by payment_token
          const cardsSnapshot = await db
            .collection("payment_cards")
            .where("payment_token", "==", data.token_id)
            .where("user_id", "==", data.user_id)
            .limit(1)
            .get();

          if (cardsSnapshot.empty) {
            throw new PaymentGatewayError(
              "Payment card not found",
              "NOT_FOUND",
              404
            );
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
        // Handle session_id case (get token from completed session)
        const sessionQuery = await db
          .collection("tokenization_sessions")
          .where("session_id", "==", data.session_id)
          .where("status", "==", "completed")
          .limit(1)
          .get();

        if (sessionQuery.empty) {
          throw new PaymentGatewayError(
            "Tokenization session not found or not completed",
            "NOT_FOUND",
            404
          );
        }

        const session = sessionQuery.docs[0].data();
        if (session.user_id !== data.user_id) {
          throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
        }

        if (!session.token_id) {
          throw new PaymentGatewayError(
            "No token available in session",
            "INVALID_STATE",
            400
          );
        }

        // Get token from session
        const cardDoc = await db
          .collection("payment_cards")
          .doc(session.token_id)
          .get();

        if (!cardDoc.exists) {
          throw new PaymentGatewayError(
            "Payment card not found",
            "NOT_FOUND",
            404
          );
        }

        const paymentCard = cardDoc.data() as PaymentCard;
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
      }

      // Process payment with provider
      const provider = PaymentProviderFactory.getProvider(data.provider);
      const result = await provider.processPayment(paymentData, token);

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error: any) {
      const gatewayError = handleError(error);

      // Update payment status to failed if it exists
      if (req.body.payment_id) {
        await db
          .collection("payments")
          .doc(req.body.payment_id)
          .update({
            status: "failed",
            error_message: gatewayError.message,
            updated_at: createTimestamp(),
          })
          .catch(() => {
            // Ignore errors updating non-existent payment
          });
      }

      const response: ApiResponse = {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
      res.status(gatewayError.statusCode || 500).json(response);
    }
  }
);

/**
 * Refund a payment
 */
export const refundPayment = functions.https.onRequest(
  async (req, res) => {
    try {
      // Validate request method
      if (req.method !== 'POST') {
        res.status(405).json({ 
          success: false, 
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' } 
        });
        return;
      }

      // Validate authentication and user agent
      const { user, metadata } = await validateRequest(req);
      const data: { payment_id: string; amount?: number } = req.body;

      validateRequiredFields(data, ["payment_id"]);

      console.log("Refunding payment", { 
        payment_id: data.payment_id,
        metadata: metadata,
      });

      // Get payment
      const paymentDoc = await db
        .collection("payments")
        .doc(data.payment_id)
        .get();

      if (!paymentDoc.exists) {
        throw new PaymentGatewayError("Payment not found", "NOT_FOUND", 404);
      }

      const payment = paymentDoc.data() as PaymentRequest;

      // Verify user is authorized (either client or professional)
      if (
        payment.user_id !== user.uid &&
        payment.professional_id !== user.uid
      ) {
        throw new PaymentGatewayError("Unauthorized", "UNAUTHORIZED", 403);
      }

      const provider = PaymentProviderFactory.getProvider(payment.provider);
      await provider.refundPayment(data.payment_id, data.amount);

      // Update payment with refund metadata
      await paymentDoc.ref.update({
        refund_metadata: metadata,
        refunded_at: createTimestamp(),
        updated_at: createTimestamp(),
      });

      const response: ApiResponse = {
        success: true,
        data: {
          message: "Payment refunded successfully",
          payment_id: data.payment_id,
        },
      };

      res.status(200).json(response);
    } catch (error: any) {
      const gatewayError = handleError(error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
      res.status(gatewayError.statusCode || 500).json(response);
    }
  }
);

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get execution location and environment info
 */
export const getExecutionLocation = functions.https.onRequest(
  async (req, res) => {
    try {
      // Validate request method
      if (req.method !== 'GET') {
        res.status(405).json({ 
          success: false, 
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET method is allowed' } 
        });
        return;
      }

      // Validate authentication and user agent
      const { user, metadata } = await validateRequest(req);

      console.log("Getting execution location", {
        user_id: user.uid,
        metadata: metadata,
      });

      const locationInfo = {
        // App Engine location headers
        city: req.headers['x-appengine-city'] as string || null,
        region: req.headers['x-appengine-region'] as string || null,
        country: req.headers['x-appengine-country'] as string || null,
        datacenter: req.headers['x-appengine-datacenter'] as string || null,
        
        // Additional location info
        cloudflareCountry: req.headers['cf-ipcountry'] as string || null,
        cloudTraceContext: req.headers['x-cloud-trace-context'] as string || null,
        
        // Network info
        forwardedFor: req.headers['x-forwarded-for'] as string || null,
        realIp: req.headers['x-real-ip'] as string || null,
        clientIp: req.ip,
        
        // Server info
        serverName: req.headers['server'] as string || null,
        userAgent: req.headers['user-agent'] as string || null,
        
        // Formatted location
        formattedLocation: metadata.executionLocation,
        
        // Timestamp
        timestamp: new Date().toISOString(),
      };

      const response: ApiResponse = {
        success: true,
        data: locationInfo,
      };

      res.status(200).json(response);
    } catch (error: any) {
      const gatewayError = handleError(error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: gatewayError.code,
          message: gatewayError.message,
          details: gatewayError.details,
        },
      };
      res.status(gatewayError.statusCode || 500).json(response);
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

    if (
      !provider ||
      !["stripe", "transbank", "mercadopago"].includes(provider)
    ) {
      res.status(400).json({
        error: "Invalid provider. Use: /webhook/{stripe|transbank|mercadopago}",
      });
      return;
    }

    // Check if provider is available
    if (
      !PaymentProviderFactory.isProviderAvailable(provider as PaymentProvider)
    ) {
      res.status(400).json({
        error: `Provider '${provider}' is not configured or available`,
      });
      return;
    }

    const paymentProvider = PaymentProviderFactory.getProvider(
      provider as PaymentProvider
    );

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
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`Webhook processing error:`, {
      provider: req.path,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: "Webhook processing failed",
      message: error.message,
    });
  }
});

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get available payment providers and their information
 */
export const getAvailableProviders = functions.https.onRequest(
  async (req, res) => {
    try {
      // Validate request method
      if (req.method !== 'GET') {
        res.status(405).json({
          success: false,
          error: "Method not allowed",
          message: "Only GET method is allowed",
        });
        return;
      }

      const availableProviders = PaymentProviderFactory.getAvailableProviders();
      const providersInfo = availableProviders.map((provider) => {
        const config = PaymentProviderFactory.getConfig(provider);
        return {
          provider,
          method: config.method,
          enabled: config.enabled,
          isTestMode: !config.secretKey || !config.accessToken || !config.apiKey, // Rough indicator of test mode
        };
      });

      const response: ApiResponse<{
        providers: any[];
        total: number;
        timestamp: string;
      }> = {
        success: true,
        data: {
          providers: providersInfo,
          total: availableProviders.length,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(response);
    } catch (error: any) {
      const gatewayError = handleError(error);
      console.error("Get providers error:", gatewayError);

      res.status(gatewayError.statusCode || 500).json({
        success: false,
        error: gatewayError.code,
        message: gatewayError.message,
      });
    }
  }
);
