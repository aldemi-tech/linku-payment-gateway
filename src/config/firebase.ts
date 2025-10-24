import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

/**
 * Simple Firebase Configuration for linku-app project
 */

// Initialize Firebase app (singleton)
const firebaseApp: App = getApps().length > 0 ? getApps()[0] : initializeApp();

/**
 * Get Firestore database instance
 */
export function getDatabase(): Firestore {
  return getFirestore(firebaseApp);
}

/**
 * Collection names
 */
export const COLLECTIONS = {
  PAYMENT_CARDS: 'paymentCards',
  TRANSACTIONS: 'transactions',
  PAYMENT_METHODS: 'paymentMethods',
  USERS: 'users',
  WEBHOOKS: 'webhooks',
  LOGS: 'logs'
} as const;

/**
 * Simple database service
 */
export class DatabaseService {
  private readonly db: Firestore;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Get collection reference
   */
  collection(name: string) {
    return this.db.collection(name);
  }

  /**
   * Get payment cards collection
   */
  getPaymentCardsCollection() {
    return this.db.collection(COLLECTIONS.PAYMENT_CARDS);
  }

  /**
   * Get transactions collection
   */
  getTransactionsCollection() {
    return this.db.collection(COLLECTIONS.TRANSACTIONS);
  }

  /**
   * Get payment methods collection
   */
  getPaymentMethodsCollection() {
    return this.db.collection(COLLECTIONS.PAYMENT_METHODS);
  }

  /**
   * Get users collection
   */
  getUsersCollection() {
    return this.db.collection(COLLECTIONS.USERS);
  }

  /**
   * Get webhooks collection
   */
  getWebhooksCollection() {
    return this.db.collection(COLLECTIONS.WEBHOOKS);
  }

  /**
   * Get logs collection
   */
  getLogsCollection() {
    return this.db.collection(COLLECTIONS.LOGS);
  }

  /**
   * Batch operations
   */
  batch() {
    return this.db.batch();
  }

  /**
   * Transactions
   */
  runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    return this.db.runTransaction(updateFunction);
  }
}

// Export singleton instances
export const db = new DatabaseService();
export const firestoreDb = getDatabase();
export { firebaseApp };