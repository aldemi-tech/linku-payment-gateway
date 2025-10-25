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
   * Initialize all payment providers
   */
  static initialize(configs: PaymentProviderConfig[]): void {
    console.log("Initializing payment providers", {
      count: configs.length,
    });

    // Initialize providers with provided configs
    configs.forEach((config) => {
      try {
        if (!config.enabled) {
          console.log(`Provider ${config.provider} is disabled, skipping`);
          return;
        }

        const provider = this.createProvider(config.provider);
        provider.initialize(config);

        this.providers.set(config.provider, provider);
        this.configs.set(config.provider, config);

        console.log(`Provider ${config.provider} initialized successfully`);
      } catch (error: any) {
        console.error(`Failed to initialize provider ${config.provider}:`, error);
      }
    });

    // Try to initialize providers without configs using test credentials
    const allProviders: PaymentProvider[] = ["stripe", "transbank", "mercadopago"];
    const configuredProviders = configs.map(c => c.provider);
    
    allProviders.forEach((providerName) => {
      if (!configuredProviders.includes(providerName)) {
        try {
          if (hasDefaultTestCredentials(providerName)) {
            console.log(`Attempting to initialize ${providerName} with default test credentials`);
            const provider = this.createProvider(providerName);
            provider.initialize({}); // Empty config, will use test credentials
            
            this.providers.set(providerName, provider);
            // Create a default config entry
            const defaultConfig: PaymentProviderConfig = {
              provider: providerName,
              method: providerName === "transbank" ? "redirect" : "direct",
              enabled: true,
            };
            this.configs.set(providerName, defaultConfig);
            
            console.log(`Provider ${providerName} initialized with test credentials`);
          } else {
            console.log(`Provider ${providerName} requires user credentials, skipping default initialization`);
          }
        } catch (error: any) {
          console.log(`Could not initialize ${providerName} with test credentials:`, error.message);
        }
      }
    });
  }

  /**
   * Get a payment provider instance
   */
  static getProvider(providerName: PaymentProvider): IPaymentProvider {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new PaymentGatewayError(
        `Payment provider '${providerName}' is not available`,
        "PROVIDER_NOT_FOUND",
        400
      );
    }

    return provider;
  }

  /**
   * Get provider configuration
   */
  static getConfig(providerName: PaymentProvider): PaymentProviderConfig {
    const config = this.configs.get(providerName);

    if (!config) {
      throw new PaymentGatewayError(
        `Configuration for provider '${providerName}' not found`,
        "CONFIG_NOT_FOUND",
        500
      );
    }

    return config;
  }

  /**
   * Check if provider is available
   */
  static isProviderAvailable(providerName: PaymentProvider): boolean {
    return this.providers.has(providerName);
  }

  /**
   * Get all available providers
   */
  static getAvailableProviders(): PaymentProvider[] {
    return Array.from(this.providers.keys());
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
