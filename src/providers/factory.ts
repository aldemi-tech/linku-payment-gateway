/**
 * Payment Provider Factory
 * Manages initialization and selection of payment providers
 */

import { PaymentProvider, PaymentProviderConfig, PaymentGatewayError } from "../types";
import { IPaymentProvider } from "./base";
import { StripeProvider } from "./stripe";
import { TransbankProvider } from "./transbank";
import { MercadoPagoProvider } from "./mercadopago";

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
