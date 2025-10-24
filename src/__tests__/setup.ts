/**
 * Jest Test Setup
 * Configura el entorno de testing para el payment gateway
 */

import { config } from 'dotenv';

// Configurar variables de entorno para testing
config({ path: '.env.test' });

// Mock Firebase Admin para testing
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      })),
      add: jest.fn(),
      where: jest.fn(() => ({
        get: jest.fn()
      })),
      get: jest.fn()
    }))
  };

  const mockAuth = {
    verifyIdToken: jest.fn()
  };

  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => mockFirestore),
    auth: jest.fn(() => mockAuth)
  };
});

// Configurar timeout global para tests
jest.setTimeout(10000);

// Variables globales para testing
declare global {
  namespace NodeJS {
    interface Global {
      mockFirestore: any;
      mockAuth: any;
    }
  }
}

// Setup global antes de cada test
beforeEach(() => {
  jest.clearAllMocks();
});

// Cleanup después de cada test
afterEach(() => {
  jest.restoreAllMocks();
});

// Test dummy para que Jest no falle
describe('Test Setup', () => {
  it('should initialize testing environment correctly', () => {
    expect(jest).toBeDefined();
    expect(process.env.NODE_ENV).toBe('test');
  });
});