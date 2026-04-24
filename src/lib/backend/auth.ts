import { randomBytes } from 'crypto';
import Stellar from '@stellar/stellar-sdk';
import { InternalError } from './errors';
import { logError } from './logger';
import { getStorageAdapter } from './storage';

export interface NonceRecord {
  nonce: string;
  address: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface SignatureVerificationRequest {
  address: string;
  signature: string;
  message: string;
}

export interface SignatureVerificationResult {
  valid: boolean;
  address?: string;
  error?: string;
}

interface StoredNonceRecord {
  nonce: string;
  address: string;
  createdAt: string;
  expiresAt: string;
}

interface SessionRecord {
  address: string;
  issuedAt: string;
}

const NONCE_TTL = 5 * 60 * 1000;
const SESSION_TTL = 24 * 60 * 60 * 1000;

function getNonceStorageKey(nonce: string): string {
  return `auth:nonce:${nonce}`;
}

function getSessionStorageKey(token: string): string {
  return `auth:session:${token}`;
}

function toStoredNonceRecord(record: NonceRecord): StoredNonceRecord {
  return {
    nonce: record.nonce,
    address: record.address,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

function toNonceRecord(record: StoredNonceRecord): NonceRecord {
  return {
    nonce: record.nonce,
    address: record.address,
    createdAt: new Date(record.createdAt),
    expiresAt: new Date(record.expiresAt),
  };
}

export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

export async function storeNonce(
  address: string,
  nonce: string,
): Promise<NonceRecord> {
  const now = new Date();
  const record: NonceRecord = {
    nonce,
    address,
    createdAt: now,
    expiresAt: new Date(now.getTime() + NONCE_TTL),
  };

  try {
    await getStorageAdapter().set(
      getNonceStorageKey(nonce),
      toStoredNonceRecord(record),
      { ttlMs: NONCE_TTL },
    );
  } catch (error) {
    logError(undefined, '[Auth] Failed to store nonce', error as Error, {
      address,
    });
    throw new InternalError(
      'Unable to create sign-in challenge. Please try again later.',
    );
  }

  return record;
}

export async function getNonceRecord(
  nonce: string,
): Promise<NonceRecord | undefined> {
  try {
    const record = await getStorageAdapter().get<StoredNonceRecord>(
      getNonceStorageKey(nonce),
    );

    if (!record) {
      return undefined;
    }

    return toNonceRecord(record);
  } catch (error) {
    logError(undefined, '[Auth] Failed to read nonce', error as Error, {
      nonce,
    });
    return undefined;
  }
}

export async function consumeNonce(nonce: string): Promise<boolean> {
  try {
    const record = await getNonceRecord(nonce);
    if (!record) {
      return false;
    }

    await getStorageAdapter().delete(getNonceStorageKey(nonce));
    return true;
  } catch (error) {
    logError(undefined, '[Auth] Failed to consume nonce', error as Error, {
      nonce,
    });
    return false;
  }
}

export function verifyStellarSignature(
  address: string,
  signature: string,
  message: string,
): SignatureVerificationResult {
  try {
    if (!address || !signature || !message) {
      return {
        valid: false,
        error: 'Missing required fields: address, signature, or message',
      };
    }

    const isValid = Stellar.verifySignature(address, signature, message);

    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid signature',
      };
    }

    return {
      valid: true,
      address,
    };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown verification error',
    };
  }
}

export async function verifySignatureWithNonce(
  request: SignatureVerificationRequest,
): Promise<SignatureVerificationResult> {
  const { address, signature, message } = request;

  const nonceMatch = message.match(/Sign in to CommitLabs:\s*([a-f0-9]+)/i);
  if (!nonceMatch) {
    return {
      valid: false,
      error: 'Invalid message format. Expected: "Sign in to CommitLabs: {nonce}"',
    };
  }

  const nonce = nonceMatch[1];
  const nonceRecord = await getNonceRecord(nonce);

  if (!nonceRecord) {
    return {
      valid: false,
      error: 'Invalid or expired nonce',
    };
  }

  if (nonceRecord.address !== address) {
    return {
      valid: false,
      error: 'Nonce address mismatch',
    };
  }

  const verificationResult = verifyStellarSignature(address, signature, message);

  if (verificationResult.valid) {
    await consumeNonce(nonce);
  }

  return verificationResult;
}

export function generateChallengeMessage(nonce: string): string {
  return `Sign in to CommitLabs: ${nonce}`;
}

export async function createSessionToken(address: string): Promise<string> {
  const token = `session_${address}_${Date.now()}`;

  try {
    await getStorageAdapter().set<SessionRecord>(
      getSessionStorageKey(token),
      {
        address,
        issuedAt: new Date().toISOString(),
      },
      { ttlMs: SESSION_TTL },
    );
  } catch (error) {
    logError(undefined, '[Auth] Failed to create session token', error as Error, {
      address,
    });
    throw new InternalError('Unable to create session. Please try again later.');
  }

  return token;
}

export async function verifySessionToken(
  token: string,
): Promise<{ valid: boolean; address?: string }> {
  try {
    const session = await getStorageAdapter().get<SessionRecord>(
      getSessionStorageKey(token),
    );

    if (!session) {
      return { valid: false };
    }

    return {
      valid: true,
      address: session.address,
    };
  } catch (error) {
    logError(undefined, '[Auth] Failed to verify session token', error as Error, {
      token,
    });
    return { valid: false };
  }
}
