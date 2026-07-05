'use strict';

/**
 * JWT authentication skeleton for the WebSocket handshake.
 *
 * This is a dependency-free scaffold that verifies a JWT's signature and
 * standard claims (exp / nbf / iss / aud) using Node's built-in `crypto`.
 * It supports RS256 (PEM public key) and HS256 (shared secret) out of the box.
 *
 * For real SAP BTP / XSUAA deployments, replace `verifyToken()` with the
 * `@sap/xssec` + `@sap/xsenv` flow, which validates the token against the
 * bound XSUAA service credentials and handles key rotation (JWKS) for you:
 *
 *   var xsenv  = require('@sap/xsenv');
 *   var xssec  = require('@sap/xssec');
 *   var creds  = xsenv.getServices({ uaa: { tag: 'xsuaa' } }).uaa;
 *   xssec.createSecurityContext(token, creds, function (err, ctx) { ... });
 *
 * The extraction / wiring code below stays the same — only `verifyToken`
 * changes.
 */

var fs = require('fs');
var crypto = require('crypto');

// --- Configuration (env-driven) ---

// Master switch. When false (default) the server runs open, for local dev.
var JWT_AUTH_ENABLED = String(process.env.JWT_AUTH_ENABLED || '').toLowerCase() === 'true';

var JWT_ALG = process.env.JWT_ALG || 'RS256'; // 'RS256' | 'HS256'

// RS256: PEM public key, inline or from a file.
var JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY ||
  (process.env.JWT_PUBLIC_KEY_FILE ? safeReadFile(process.env.JWT_PUBLIC_KEY_FILE) : '');

// HS256: shared secret.
var JWT_SECRET = process.env.JWT_SECRET || '';

// Optional claim checks. Empty => not enforced.
var JWT_ISSUER = process.env.JWT_ISSUER || '';
var JWT_AUDIENCE = process.env.JWT_AUDIENCE || '';

var CLOCK_SKEW_SEC = 60; // tolerance for exp / nbf

function safeReadFile(path) {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch (err) {
    console.error('JWT: failed to read key file ' + path + ': ' + err.message);
    return '';
  }
}

// --- Token extraction from the upgrade request ---

/**
 * Pull a bearer token out of the HTTP upgrade request.
 * Order: Authorization header -> access_token query param.
 *
 * Note: browsers cannot set custom headers on `new WebSocket()`, so a
 * browser client typically passes the token as a query parameter, or via the
 * `Sec-WebSocket-Protocol` subprotocol (which then requires echoing the chosen
 * protocol back — see `handleProtocols` in the ws docs).
 *
 * @param {http.IncomingMessage} req
 * @returns {string|null}
 */
function extractToken(req) {
  var authHeader = req.headers && req.headers['authorization'];
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  // Query param fallback (browser-friendly). Host is irrelevant for parsing.
  try {
    var url = new URL(req.url, 'http://localhost');
    var qp = url.searchParams.get('access_token') || url.searchParams.get('token');
    if (qp) { return qp.trim(); }
  } catch (e) { /* malformed URL -> no token */ }

  return null;
}

// --- JWT verification (dependency-free) ---

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function verifySignature(signingInput, signatureB64Url, alg) {
  var signature = Buffer.from(signatureB64Url, 'base64url');

  if (alg === 'RS256') {
    if (!JWT_PUBLIC_KEY) { throw new Error('JWT_PUBLIC_KEY not configured for RS256'); }
    return crypto.createVerify('RSA-SHA256')
      .update(signingInput)
      .verify(JWT_PUBLIC_KEY, signature);
  }

  if (alg === 'HS256') {
    if (!JWT_SECRET) { throw new Error('JWT_SECRET not configured for HS256'); }
    var expected = crypto.createHmac('sha256', JWT_SECRET).update(signingInput).digest();
    // timingSafeEqual requires equal-length buffers.
    return expected.length === signature.length &&
      crypto.timingSafeEqual(expected, signature);
  }

  throw new Error('Unsupported JWT alg: ' + alg);
}

/**
 * Verify a raw JWT string. Returns the decoded claims or throws.
 *
 * @param {string} token
 * @returns {object} decoded payload claims
 */
function verifyToken(token) {
  var parts = token.split('.');
  if (parts.length !== 3) { throw new Error('Malformed JWT'); }

  var header = JSON.parse(base64UrlDecode(parts[0]));
  var payload = JSON.parse(base64UrlDecode(parts[1]));

  // Pin the algorithm — never trust the token's own header to pick it.
  if (header.alg !== JWT_ALG) {
    throw new Error('Unexpected alg "' + header.alg + '", expected "' + JWT_ALG + '"');
  }

  var signingInput = parts[0] + '.' + parts[1];
  if (!verifySignature(signingInput, parts[2], JWT_ALG)) {
    throw new Error('Invalid signature');
  }

  var now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now > payload.exp + CLOCK_SKEW_SEC) {
    throw new Error('Token expired');
  }
  if (typeof payload.nbf === 'number' && now + CLOCK_SKEW_SEC < payload.nbf) {
    throw new Error('Token not yet valid');
  }
  if (JWT_ISSUER && payload.iss !== JWT_ISSUER) {
    throw new Error('Issuer mismatch');
  }
  if (JWT_AUDIENCE) {
    var aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (aud.indexOf(JWT_AUDIENCE) === -1) { throw new Error('Audience mismatch'); }
  }

  return payload;
}

// --- Public API used by the handshake ---

/**
 * Authenticate an incoming WebSocket upgrade request.
 *
 * @param {http.IncomingMessage} req
 * @returns {{ valid: boolean, claims: (object|null), error: (string|null) }}
 */
function authenticate(req) {
  if (!JWT_AUTH_ENABLED) {
    return { valid: true, claims: null, error: null };
  }

  var token = extractToken(req);
  if (!token) {
    return { valid: false, claims: null, error: 'No token provided' };
  }

  try {
    var claims = verifyToken(token);
    return { valid: true, claims: claims, error: null };
  } catch (err) {
    return { valid: false, claims: null, error: err.message };
  }
}

/**
 * Best-effort display name from verified claims (XSUAA uses `user_name`;
 * OIDC-style tokens use `given_name` / `name` / `email`). Returns '' if none.
 */
function nameFromClaims(claims) {
  if (!claims) { return ''; }
  return claims.user_name || claims.given_name || claims.name || claims.email || '';
}

function isEnabled() {
  return JWT_AUTH_ENABLED;
}

module.exports = {
  authenticate: authenticate,
  nameFromClaims: nameFromClaims,
  isEnabled: isEnabled,
  // exported for unit testing
  verifyToken: verifyToken,
  extractToken: extractToken,
};
