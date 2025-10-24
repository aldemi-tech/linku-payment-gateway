/**
 * Basic Tests for Payment Gateway Functions
 */

import { PaymentProvider, PaymentCard } from '../types';

describe('Payment Gateway', () => {
  describe('Basic Configuration', () => {
    it('should have required environment variables defined', () => {
      // Test que las variables de entorno básicas estén disponibles
      expect(process.env.NODE_ENV).toBeDefined();
    });

    it('should have correct PaymentProvider types', () => {
      const stripeProvider: PaymentProvider = 'stripe';
      const transbankProvider: PaymentProvider = 'transbank';
      const mercadopagoProvider: PaymentProvider = 'mercadopago';

      expect(stripeProvider).toBe('stripe');
      expect(transbankProvider).toBe('transbank');
      expect(mercadopagoProvider).toBe('mercadopago');
    });
  });

  describe('Type Definitions', () => {
    it('should have correct PaymentCard structure', () => {
      const mockCard: Partial<PaymentCard> = {
        card_id: 'card-123',
        user_id: 'user-123',
        card_last_four: '1234',
        card_brand: 'visa',
        card_type: 'credit',
        expiration_month: 12,
        expiration_year: 2025,
        is_default: false,
        payment_token: 'tok_123',
        requires_cvv_for_payments: false
      };

      expect(mockCard.card_id).toBe('card-123');
      expect(mockCard.card_last_four).toBe('1234');
      expect(mockCard.card_brand).toBe('visa');
    });
  });

  describe('Module Imports', () => {
    it('should import firebase config without errors', async () => {
      const { getDatabase } = await import('../config/firebase');
      expect(getDatabase).toBeDefined();
      expect(typeof getDatabase).toBe('function');
    });

    it('should import provider factory without errors', async () => {
      const { PaymentProviderFactory } = await import('../providers/factory');
      expect(PaymentProviderFactory).toBeDefined();
    });
  });
});

describe('Environment Setup', () => {
  it('should be in test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should have Jest globals available', () => {
    expect(expect).toBeDefined();
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
    expect(jest).toBeDefined();
  });
});