/**
 * Test credentials for payment providers
 * These are public test credentials that can be used for development and testing
 */

// Transbank test credentials (these are publicly documented)
export const TRANSBANK_TEST_CONFIG = {
  commerceCode: "597055555532", // OneClick Mall test commerce code
  apiKey: "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C", // Test API key
  environment: "integration"
};

// Stripe test credentials (always use test keys for development)
export const STRIPE_TEST_CONFIG = {
  // These are placeholder test keys - users should replace with their actual test keys
  secretKey: "sk_test_...", // This needs to be a valid Stripe test key
  publicKey: "pk_test_...", // This needs to be a valid Stripe public test key
  webhookSecret: "whsec_test_...", // Optional webhook secret for test
  environment: "test"
};

// MercadoPago test credentials
export const MERCADOPAGO_TEST_CONFIG = {
  // MercadoPago requires actual credentials even for testing
  // Users need to create a test application in their MercadoPago account
  accessToken: "TEST-...", // This needs to be a valid test access token
  environment: "sandbox"
};

/**
 * Check if a provider supports default test credentials
 */
export const hasDefaultTestCredentials = (provider: string): boolean => {
  switch (provider) {
    case "transbank":
      return true; // Transbank has public test credentials
    case "stripe":
      return false; // Stripe requires user's own test keys
    case "mercadopago":
      return false; // MercadoPago requires user's own test credentials
    default:
      return false;
  }
};

/**
 * Get default test configuration for a provider
 */
export const getDefaultTestConfig = (provider: string): Record<string, unknown> => {
  switch (provider) {
    case "transbank":
      return TRANSBANK_TEST_CONFIG;
    case "stripe":
      return STRIPE_TEST_CONFIG;
    case "mercadopago":
      return MERCADOPAGO_TEST_CONFIG;
    default:
      throw new Error(`No default test configuration available for provider: ${provider}`);
  }
};