/**
 * Payment Provider Factory
 * Manages initialization and selection of payment providers
 */

import { PaymentProvider, PaymentProviderConfig, PaymentGatewayError } from "../types";
import { IPaymentProvider } from "./base";
import { StripeProvider } from "./stripe";
import { TransbankProvider } from "./transbank";
import { MercadoPagoProvider } from "./mercadopago";
import { hasDefaultTestCredentials } from "../config/test-credentials";

export class PaymentProviderFactory {
  private static providers: Map<PaymentProvider, IPaymentProvider> = new Map();
  private static configs: Map<PaymentProvider, PaymentProviderConfig> = new Map();

  /**
   * Store provider configurations (doesn't initialize providers yet)
   */
  static initialize(configs: PaymentProviderConfig[]): void {
    console.log("Storing provider configurations", {
      count: configs.length,
    });

    // Store user-provided configs
    configs.forEach((config) => {
      if (config.enabled) {
        this.configs.set(config.provider, config);
        console.log(`Configuration stored for provider ${config.provider}`);
      } else {
        console.log(`Provider ${config.provider} is disabled`);
      }
    });

    console.log("Provider configurations stored successfully");
  }

  /**
   * Get a payment provider instance (lazy initialization)
   */
  static getProvider(providerName: PaymentProvider): IPaymentProvider {
    // Check if provider is already initialized
    const existingProvider = this.providers.get(providerName);
    if (existingProvider) {
      return existingProvider;
    }

    // Try to initialize the provider on-demand
    try {
      const provider = this.createProvider(providerName);
      
      // Get user configuration if available
      const userConfig = this.configs.get(providerName);
      
      if (userConfig) {
        // Use user-provided configuration
        console.log(`Initializing ${providerName} with user configuration`);
        provider.initialize(userConfig);
      } else if (hasDefaultTestCredentials(providerName)) {
        // Use default test credentials
        console.log(`Initializing ${providerName} with default test credentials`);
        provider.initialize({}); // Empty config, will use test credentials
        
        // Create a default config entry
        const defaultConfig: PaymentProviderConfig = {
          provider: providerName,
          method: providerName === "transbank" ? "redirect" : "direct",
          enabled: true,
        };
        this.configs.set(providerName, defaultConfig);
      } else {
        // Provider requires user configuration
        throw new PaymentGatewayError(
          `Provider '${providerName}' requires configuration. Please provide API keys or credentials.`,
          "MISSING_CONFIG",
          400
        );
      }

      // Store the initialized provider
      this.providers.set(providerName, provider);
      console.log(`Provider ${providerName} initialized successfully`);
      
      return provider;
    } catch (error: any) {
      console.error(`Failed to initialize provider ${providerName}:`, error);
      throw new PaymentGatewayError(
        `Payment provider '${providerName}' is not available: ${error.message}`,
        "PROVIDER_NOT_FOUND",
        400
      );
    }
  }

  /**
   * Get provider configuration
   */
  static getConfig(providerName: PaymentProvider): PaymentProviderConfig {
    // Try to get existing config
    let config = this.configs.get(providerName);

    if (!config) {
      // If no config exists but provider has default test credentials, create default config
      if (hasDefaultTestCredentials(providerName)) {
        config = {
          provider: providerName,
          method: providerName === "transbank" ? "redirect" : "direct",
          enabled: true,
        };
        // Don't store it yet, just return it
      } else {
        throw new PaymentGatewayError(
          `Configuration for provider '${providerName}' not found`,
          "CONFIG_NOT_FOUND",
          500
        );
      }
    }

    return config;
  }

  /**
   * Check if provider is available (without initializing it)
   */
  static isProviderAvailable(providerName: PaymentProvider): boolean {
    // If already initialized, it's available
    if (this.providers.has(providerName)) {
      return true;
    }

    // If has user config, it's available
    if (this.configs.has(providerName)) {
      return true;
    }

    // If has default test credentials, it's available
    if (hasDefaultTestCredentials(providerName)) {
      return true;
    }

    return false;
  }

  /**
   * Get all available providers (includes both initialized and potentially available)
   */
  static getAvailableProviders(): PaymentProvider[] {
    const allProviders: PaymentProvider[] = ["stripe", "transbank", "mercadopago"];
    const availableProviders: PaymentProvider[] = [];

    // Check each provider to see if it can be initialized
    allProviders.forEach((providerName) => {
      try {
        // If already initialized, it's available
        if (this.providers.has(providerName)) {
          availableProviders.push(providerName);
          return;
        }

        // If has user config, it's available
        if (this.configs.has(providerName)) {
          availableProviders.push(providerName);
          return;
        }

        // If has default test credentials, it's available
        if (hasDefaultTestCredentials(providerName)) {
          availableProviders.push(providerName);
          return;
        }
      } catch (error) {
        console.log(`Provider ${providerName} is not available:`, error);
      }
    });

    return availableProviders;
  }

  /**
   * Create provider instance based on name
   */
  private static createProvider(providerName: PaymentProvider): IPaymentProvider {
    switch (providerName) {
      case "stripe":
        return new StripeProvider();
      case "transbank":
        return new TransbankProvider();
      case "mercadopago":
        return new MercadoPagoProvider();
      default:
        throw new PaymentGatewayError(
          `Unknown payment provider: ${providerName}`,
          "UNKNOWN_PROVIDER",
          400
        );
    }
  }
}
