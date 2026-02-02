let nodeCryptoPromise: Promise<typeof import('crypto')> | null = null;const NODE_CRYPTO_IMPORT = () => import('crypto');
function getCrypto(): Crypto | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  return (globalThis as unknown as { crypto?: Crypto }).crypto ?? null;
}
async function sha256(message: string): Promise<string> {
  if (hasSubtleCrypto()) {
    const cryptoInstance = getCrypto()!;
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await cryptoInstance.subtle!.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const { createHash } = await getNodeCrypto();
  return createHash('sha256').update(message).digest('hex');
}
function hasSubtleCrypto(): boolean {
  const cryptoInstance = getCrypto();
  return Boolean(cryptoInstance?.subtle);
}
async function hmacSha256(secret: string, message: string): Promise<string> {
  if (hasSubtleCrypto()) {
    const cryptoInstance = getCrypto()!;
    const encoder = new TextEncoder();
    const key = await cryptoInstance.subtle!.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await cryptoInstance.subtle!.sign('HMAC', key, encoder.encode(message));
    const signatureArray = Array.from(new Uint8Array(signature));
    return signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const { createHmac } = await getNodeCrypto();
  return createHmac('sha256', secret).update(message).digest('hex');
}
async function getNodeCrypto() {
  if (!nodeCryptoPromise) {
    nodeCryptoPromise = NODE_CRYPTO_IMPORT();
  }
  return nodeCryptoPromise;
}
var lastTimestampMs = 0;
function getMonotonicTimestamp(): string {
  const now = Date.now();
  if (now <= lastTimestampMs) {
    lastTimestampMs += 1;
  } else {
    lastTimestampMs = now;
  }
  return lastTimestampMs.toString();
}
export async function generateAuthQueryParams(
  path: string
): Promise<Record<string, string>> {
  const credentials = getAuthCredentials();
  if (!credentials) {
    return {};
  }

  const { apiKey, secret } = credentials;
  const timestamp = getMonotonicTimestamp();

  // WebSocket upgrades always use GET method and empty body
  const bodyHash = await sha256('');

  // Build signature payload: METHOD + PATH + TIMESTAMP + BODY_HASH
  const payload = `GET${path}${timestamp}${bodyHash}`;

  // Compute HMAC signature
  const signature = await hmacSha256(secret, payload);

//   if (AUTH_DEBUG) {
//     console.log('[oracle-auth] WS signature payload', {
//       method: 'GET',
//       path,
//       timestamp,
//       bodyHash,
//       payload,
//       signature,
//     }
//);
  //}

  return {
    apiKey,
    signature,
    timestamp,
  };
}

/**
 * Build authenticated WebSocket URL
 * 
 * @param baseUrl - Base WebSocket URL (e.g., ws://localhost:4000/ws/prices)
 * @param additionalParams - Additional query parameters
 * @returns Authenticated WebSocket URL
 */
export async function buildAuthenticatedWebSocketUrl(
  baseUrl: string,
  additionalParams?: Record<string, string>
): Promise<string> {
  const url = new URL(baseUrl);
  const path = url.pathname;

  // Generate auth params
  const authParams = await generateAuthQueryParams(path);

  // Merge with additional params
  const allParams = { ...authParams, ...additionalParams };

  // Build query string
  Object.entries(allParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}
export function getAuthCredentials(): { apiKey: string; secret: string } | null {
//   const apiKey = process.env.NEXT_PUBLIC_ORACLE_API_KEY;
//   const secret = process.env.NEXT_PUBLIC_ORACLE_API_SECRET;

  const apiKey = "9abbf555edd5dc002c13fa8995e5bb89";
  const secret = "gpfABkAO8VUa3w4ra+E/3F9X6i1cXpWHUXYTNQYr7p8=";
  if (!apiKey || !secret) {
    return null;
  }

  return { apiKey, secret };
}