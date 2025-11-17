/**
 * Utility to decode and verify JWTs from IRL Browser using jwt-decode and @noble/ed25519
 * Based on the IRL Browser Specification specification
 */

import { jwtDecode } from 'jwt-decode'
import { ed25519 } from '@noble/curves/ed25519.js';
import * as base58 from 'base58-universal'

export interface IRLJWTPayload {
  iss: string; // DID of the user
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
  type: string; // Message type (e.g., 'irl:profile:disconnected', 'irl:error')
  data: {
    [key: string]: any;
  };
}

/**
 * Decode and verify a JWT from IRL Browser
 */
export async function decodeAndVerifyJWT(jwt: string): Promise<IRLJWTPayload> {
  try {
    // First decode to get the issuer (DID) and claims
    const decoded = jwtDecode(jwt);

    if (!decoded.iss || typeof decoded.iss !== 'string') {
      throw new Error('JWT missing issuer (iss) claim');
    }

    // check if expired
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      throw new Error('JWT expired');
    }

    // check audience claim to ensure this JWT is intended for this application (use in production)
    // if (decoded.aud && decoded.aud !== 'https://yourdomain.com') {
    //   throw new Error(`This JWT is not intended for this application. aud received: ${decoded.aud}`);
    // }

    // Extract public key bytes from DID
    const publicKeyBytes = extractPublicKeyFromDID(decoded.iss);

    // Verify the JWT signature
    await verifyJWTSignature(jwt, publicKeyBytes);

    // Return the payload in our expected format
    return decoded as unknown as IRLJWTPayload;
  } catch (error) {
    // If signature verification fails, log and throw
    console.warn('JWT verification failed:', (error as Error).message || 'Unknown error');
    throw error;
  }
}

/**
 * Extract the public key bytes from a DID (did:key format)
 */
function extractPublicKeyFromDID(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Invalid DID format. Expected did:key:z');
  }

  // Extract the base58-encoded key (after 'did:key:z')
  const base58String = did.substring('did:key:z'.length);

  // Decode base58 using the same library as IRL Browser
  const bytes = base58.decode(base58String);

  // Remove the Ed25519 multicodec prefix [0xed, 0x01]
  if (!(bytes[0] === 0xed && bytes[1] === 0x01)) {
    throw new Error('Invalid Ed25519 multicodec prefix');
  }

  // Get the raw public key bytes (32 bytes for Ed25519)
  const publicKeyBytes = bytes.slice(2);

  // Convert to Uint8Array for @noble/ed25519
  return new Uint8Array(publicKeyBytes);
}

/**
 * Verify JWT signature using Ed25519
 */
async function verifyJWTSignature(jwt: string, publicKeyBytes: Uint8Array): Promise<void> {
  // Split JWT into parts: header.payload.signature
  const JWTParts = jwt.split('.');
  if (JWTParts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [header, payload, signatureB64] = JWTParts;

  // Decode the signature from base64url
  const signature = base64urlToBytes(signatureB64);

  // Create the message that was signed (header.payload as UTF-8 bytes)
  const message = new TextEncoder().encode(`${header}.${payload}`);

  // Verify the signature using @noble/ed25519
  const isValid = await ed25519.verify(signature, message, publicKeyBytes);

  if (!isValid) {
    throw new Error('Invalid JWT signature');
  }
}

/**
 * Convert base64url string to bytes
 */
function base64urlToBytes(base64url: string): Uint8Array {
  // Convert base64url to base64
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  // Add padding if needed
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  // Decode base64 to binary string
  const binary = atob(padded);

  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
