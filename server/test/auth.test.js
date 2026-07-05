'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// --- helpers ---

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function signHS256(payload, secret, header = { alg: 'HS256', typ: 'JWT' }) {
  const input = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(input).digest('base64url');
  return `${input}.${sig}`;
}

function signRS256(payload, privateKey) {
  const input = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(payload)}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url');
  return `${input}.${sig}`;
}

// (Re)load auth.js with a specific env, since it reads config once at load time.
const AUTH_ENV_KEYS = [
  'JWT_AUTH_ENABLED', 'JWT_ALG', 'JWT_SECRET', 'JWT_PUBLIC_KEY',
  'JWT_PUBLIC_KEY_FILE', 'JWT_ISSUER', 'JWT_AUDIENCE',
];
function loadAuth(env) {
  AUTH_ENV_KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../auth')];
  return require('../auth');
}

const nowSec = () => Math.floor(Date.now() / 1000);
const SECRET = 'test-secret-value';

// --- verifyToken (HS256) ---

test('HS256: a valid token verifies and returns its claims', () => {
  const auth = loadAuth({ JWT_ALG: 'HS256', JWT_SECRET: SECRET });
  const claims = auth.verifyToken(signHS256({ user_name: 'alice', exp: nowSec() + 3600 }, SECRET));
  assert.strictEqual(claims.user_name, 'alice');
});

test('HS256: a wrong signature is rejected', () => {
  const auth = loadAuth({ JWT_ALG: 'HS256', JWT_SECRET: SECRET });
  assert.throws(() => auth.verifyToken(signHS256({ user_name: 'eve' }, 'wrong-secret')), /signature/i);
});

test('an expired token is rejected', () => {
  const auth = loadAuth({ JWT_ALG: 'HS256', JWT_SECRET: SECRET });
  assert.throws(() => auth.verifyToken(signHS256({ exp: nowSec() - 3600 }, SECRET)), /expired/i);
});

test('a not-yet-valid (nbf) token is rejected', () => {
  const auth = loadAuth({ JWT_ALG: 'HS256', JWT_SECRET: SECRET });
  assert.throws(() => auth.verifyToken(signHS256({ nbf: nowSec() + 3600 }, SECRET)), /not yet valid/i);
});

test('issuer mismatch is rejected', () => {
  const auth = loadAuth({ JWT_ALG: 'HS256', JWT_SECRET: SECRET, JWT_ISSUER: 'https://good' });
  assert.throws(() => auth.verifyToken(signHS256({ iss: 'https://evil' }, SECRET)), /issuer/i);
});

test('audience is enforced (array or string)', () => {
  const auth = loadAuth({ JWT_ALG: 'HS256', JWT_SECRET: SECRET, JWT_AUDIENCE: 'ttt' });
  assert.ok(auth.verifyToken(signHS256({ aud: 'ttt' }, SECRET)));
  assert.ok(auth.verifyToken(signHS256({ aud: ['other', 'ttt'] }, SECRET)));
  assert.throws(() => auth.verifyToken(signHS256({ aud: 'nope' }, SECRET)), /audience/i);
});

test('the algorithm is pinned — a mismatched header alg is rejected (alg-confusion guard)', () => {
  const auth = loadAuth({ JWT_ALG: 'HS256', JWT_SECRET: SECRET });
  const forged = signHS256({ user_name: 'x' }, SECRET, { alg: 'none', typ: 'JWT' });
  assert.throws(() => auth.verifyToken(forged), /alg/i);
});

test('a malformed token is rejected', () => {
  const auth = loadAuth({ JWT_ALG: 'HS256', JWT_SECRET: SECRET });
  assert.throws(() => auth.verifyToken('not.a.valid.jwt'), /Malformed/i);
  assert.throws(() => auth.verifyToken('onlyonepart'), /Malformed/i);
});

// --- verifyToken (RS256) ---

test('RS256: a token signed with the matching private key verifies', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const auth = loadAuth({ JWT_ALG: 'RS256', JWT_PUBLIC_KEY: publicKey });
  const claims = auth.verifyToken(signRS256({ user_name: 'bob', exp: nowSec() + 3600 }, privateKey));
  assert.strictEqual(claims.user_name, 'bob');
});

// --- extractToken ---

test('extractToken reads the Authorization bearer header and query params', () => {
  const auth = loadAuth({});
  assert.strictEqual(auth.extractToken({ headers: { authorization: 'Bearer abc.def.ghi' }, url: '/' }), 'abc.def.ghi');
  assert.strictEqual(auth.extractToken({ headers: {}, url: '/?access_token=qtok' }), 'qtok');
  assert.strictEqual(auth.extractToken({ headers: {}, url: '/?token=ttok' }), 'ttok');
  assert.strictEqual(auth.extractToken({ headers: {}, url: '/no-token' }), null);
});

// --- nameFromClaims ---

test('nameFromClaims prefers user_name, then given_name/name/email, else empty', () => {
  const auth = loadAuth({});
  assert.strictEqual(auth.nameFromClaims({ user_name: 'u', email: 'e' }), 'u');
  assert.strictEqual(auth.nameFromClaims({ given_name: 'g' }), 'g');
  assert.strictEqual(auth.nameFromClaims({ email: 'e@x' }), 'e@x');
  assert.strictEqual(auth.nameFromClaims(null), '');
  assert.strictEqual(auth.nameFromClaims({}), '');
});

// --- authenticate (the handshake entry point) ---

test('authenticate is a no-op pass when JWT auth is disabled', () => {
  const auth = loadAuth({ JWT_AUTH_ENABLED: 'false' });
  const res = auth.authenticate({ headers: {}, url: '/' });
  assert.deepStrictEqual(res, { valid: true, claims: null, error: null });
});

test('authenticate rejects when enabled and no token is supplied', () => {
  const auth = loadAuth({ JWT_AUTH_ENABLED: 'true', JWT_ALG: 'HS256', JWT_SECRET: SECRET });
  const res = auth.authenticate({ headers: {}, url: '/' });
  assert.strictEqual(res.valid, false);
  assert.match(res.error, /no token/i);
});

test('authenticate accepts a valid token and returns its claims when enabled', () => {
  const auth = loadAuth({ JWT_AUTH_ENABLED: 'true', JWT_ALG: 'HS256', JWT_SECRET: SECRET });
  const token = signHS256({ user_name: 'carol', exp: nowSec() + 3600 }, SECRET);
  const res = auth.authenticate({ headers: { authorization: `Bearer ${token}` }, url: '/' });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.claims.user_name, 'carol');
});
