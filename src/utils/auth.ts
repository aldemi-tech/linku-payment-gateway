/**
 * Authentication and request validation utilities
 */

import * as admin from "firebase-admin";
import { PaymentGatewayError } from "../types";
import { Request } from "firebase-functions/v1";

export interface RequestMetadata {
  ip: string;
  userAgent: string;
  origin?: string;
  referer?: string;
  acceptLanguage?: string;
  authorization?: string;
  contentType?: string;
  executionLocation?: string;
  timestamp: admin.firestore.Timestamp;
  [key: string]: any;
}

/**
 * Validates Bearer token from Authorization header
 */
export const validateBearerToken = async (req: Request): Promise<admin.auth.DecodedIdToken> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new PaymentGatewayError(
      'Missing or invalid Authorization',
      'UNAUTHORIZED',
      401
    );
  }

  const token = authHeader.split('Bearer ')[1];
  
  if (!token) {
    throw new PaymentGatewayError(
      'Missing or invalid Authorization',
      'UNAUTHORIZED', 
      401
    );
  }

  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error: any) {
    console.error('Token verification failed:', error);
    throw new PaymentGatewayError(
      'Missing or invalid Authorization',
      'UNAUTHORIZED',
      401,
      error
    );
  }
};

/**
 * Validates that User-Agent starts with "Linku"
 */
export const validateUserAgent = (req: Request): void => {
  const userAgent = req.headers['user-agent'];
  
  if (!userAgent) {
    throw new PaymentGatewayError(
      'User-Agent header is required',
      'BAD_REQUEST',
      400
    );
  }

  if (!userAgent.startsWith('Linku')) {
    throw new PaymentGatewayError(
      'Invalid request source',
      'BAD_REQUEST', 
      400
    );
  }
};

/**
 * Detects execution location from headers
 */
export const detectExecutionLocation = (req: Request): string | null => {
  // Check for App Engine headers
  const appEngineCity = req.headers['x-appengine-city'];
  const appEngineRegion = req.headers['x-appengine-region']; 
  const appEngineCountry = req.headers['x-appengine-country'];
  
  if (appEngineCity || appEngineRegion || appEngineCountry) {
    return `${appEngineCity || 'Unknown'}, ${appEngineRegion || 'Unknown'}, ${appEngineCountry || 'Unknown'}`;
  }

  // Check for other location headers
  const cfIpCountry = req.headers['cf-ipcountry'];
  if (cfIpCountry) {
    return `Country: ${cfIpCountry}`;
  }

  // Check for Google Cloud region
  const gcpRegion = req.headers['x-cloud-trace-context'];
  if (gcpRegion) {
    return `GCP Region detected`;
  }

  return null;
};

/**
 * Extracts and formats request metadata
 */
export const extractRequestMetadata = (req: Request): RequestMetadata => {
  const metadata: RequestMetadata = {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    timestamp: admin.firestore.Timestamp.now(),
  };

  // Optional headers
  if (req.headers.origin) metadata.origin = req.headers.origin;
  if (req.headers.referer) metadata.referer = req.headers.referer;
  if (req.headers['accept-language']) metadata.acceptLanguage = req.headers['accept-language'];
  if (req.headers.authorization) metadata.authorization = req.headers.authorization;
  if (req.headers['content-type']) metadata.contentType = req.headers['content-type'];

  // Execution location
  const location = detectExecutionLocation(req);
  if (location) metadata.executionLocation = location;

  // Add any x-appengine headers
  for (const key of Object.keys(req.headers)) {
    if (key.startsWith('x-appengine-') || key.startsWith('x-forwarded-') || key.startsWith('x-cloud-')) {
      metadata[key] = req.headers[key];
    }
  }

  return metadata;
};

/**
 * Combined validation for auth + user agent + metadata extraction
 */
export const validateRequest = async (req: Request): Promise<{
  user: admin.auth.DecodedIdToken;
  metadata: RequestMetadata;
}> => {
  // Validate User-Agent first (faster check)
  validateUserAgent(req);
  
  // Validate Bearer token
  const user = await validateBearerToken(req);
  
  // Extract metadata
  const metadata = extractRequestMetadata(req);
  
  return { user, metadata };
};