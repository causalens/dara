import { createHash, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { URL, URLSearchParams } from 'node:url';

import {
  ALLOWED_GROUP,
  DEFAULT_CLIENT_ID,
  DEFAULT_ISSUER,
  DEFAULT_REDIRECT_URI,
  DEFAULT_SCOPES,
} from './profiles.mjs';

const issuer = process.env.QA_OIDC_ISSUER ?? DEFAULT_ISSUER;
const clientId = process.env.QA_OIDC_CLIENT_ID ?? DEFAULT_CLIENT_ID;
const redirectUri = process.env.QA_OIDC_REDIRECT_URI ?? DEFAULT_REDIRECT_URI;
const scopes = process.env.QA_OIDC_SCOPES ?? DEFAULT_SCOPES;

function http(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = request(
      {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
            status: res.statusCode,
          });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.end(body);
    } else {
      req.end();
    }
  });
}

function decodeJwtPayload(jwt) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

async function setProfile(profileName) {
  const response = await fetch(`${issuer}/__qa/profile/${profileName}`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to switch profile to ${profileName}: ${await response.text()}`);
  }
}

async function runAuthorizationCodeFlow() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(8).toString('hex');
  const nonce = randomBytes(8).toString('hex');
  const authUrl = new URL(`${issuer}/auth`);

  authUrl.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    nonce,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state,
  }).toString();

  let response = await http('GET', authUrl.toString());
  let cookie = response.headers['set-cookie']?.map((value) => value.split(';')[0]).join('; ') ?? '';
  let location = response.headers.location;

  for (let i = 0; i < 8 && location && !location.startsWith(redirectUri); i += 1) {
    response = await http('GET', new URL(location, issuer).toString(), { headers: { cookie } });
    if (response.headers['set-cookie']) {
      cookie = [cookie, ...response.headers['set-cookie'].map((value) => value.split(';')[0])]
        .filter(Boolean)
        .join('; ');
    }
    location = response.headers.location;
  }

  if (!location?.startsWith(redirectUri)) {
    throw new Error(`Authorization flow did not redirect to the configured redirect URI: ${location}`);
  }

  const redirect = new URL(location);
  if (redirect.searchParams.get('state') !== state) {
    throw new Error('Authorization flow returned an unexpected state value');
  }

  const tokenBody = new URLSearchParams({
    client_id: clientId,
    code: redirect.searchParams.get('code'),
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  }).toString();

  response = await http('POST', `${issuer}/token`, {
    body: tokenBody,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });

  if (response.status !== 200) {
    throw new Error(`Token exchange failed with ${response.status}: ${response.body}`);
  }

  const tokens = JSON.parse(response.body);
  return {
    nonce,
    tokens,
  };
}

async function refresh(refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }).toString();

  const response = await http('POST', `${issuer}/token`, {
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });

  if (response.status !== 200) {
    throw new Error(`Refresh failed with ${response.status}: ${response.body}`);
  }

  return JSON.parse(response.body);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function checkHappy() {
  await setProfile('happy');
  const { nonce, tokens } = await runAuthorizationCodeFlow();
  const claims = decodeJwtPayload(tokens.id_token);
  assert(tokens.refresh_token, 'happy profile should issue a refresh token');
  assert(claims.nonce === nonce, 'happy profile should preserve the OIDC nonce');
  assert(claims.groups.includes(ALLOWED_GROUP), 'happy profile should include the allowed group');
}

async function checkHugeGroups() {
  await setProfile('huge-groups');
  const { tokens } = await runAuthorizationCodeFlow();
  const claims = decodeJwtPayload(tokens.id_token);
  assert(claims.groups.length > 700, 'huge-groups profile should issue a large groups claim');
  assert(claims.groups.includes(ALLOWED_GROUP), 'huge-groups profile should keep the allowed group');
}

async function checkNoGroupsClaim() {
  await setProfile('no-groups-claim');
  const { tokens } = await runAuthorizationCodeFlow();
  const claims = decodeJwtPayload(tokens.id_token);
  assert(!Object.hasOwn(claims, 'groups'), 'no-groups-claim profile should omit groups');
}

async function checkGroupsString() {
  await setProfile('groups-string');
  const { tokens } = await runAuthorizationCodeFlow();
  const claims = decodeJwtPayload(tokens.id_token);
  assert(typeof claims.groups === 'string', 'groups-string profile should return groups as a string');
  assert(claims.groups.includes(ALLOWED_GROUP), 'groups-string profile should include the allowed group string');
}

async function checkSingleGroupString() {
  await setProfile('single-group-string');
  const { tokens } = await runAuthorizationCodeFlow();
  const claims = decodeJwtPayload(tokens.id_token);
  assert(claims.groups === ALLOWED_GROUP, 'single-group-string profile should return only the allowed group string');
}

async function checkMemberOfGroups() {
  await setProfile('member-of-groups');
  const { tokens } = await runAuthorizationCodeFlow();
  const claims = decodeJwtPayload(tokens.id_token);
  assert(!Object.hasOwn(claims, 'groups'), 'member-of-groups profile should omit the standard groups claim');
  assert(Array.isArray(claims.memberOf), 'member-of-groups profile should return memberOf as an array');
  assert(claims.memberOf.includes(ALLOWED_GROUP), 'member-of-groups profile should include the allowed memberOf group');
}

async function checkRefreshLosesGroup() {
  await setProfile('refresh-loses-group');
  const { tokens } = await runAuthorizationCodeFlow();
  const initialClaims = decodeJwtPayload(tokens.id_token);
  const refreshedTokens = await refresh(tokens.refresh_token);
  const refreshedClaims = decodeJwtPayload(refreshedTokens.id_token);
  assert(
    initialClaims.groups.includes(ALLOWED_GROUP),
    'refresh-loses-group profile should include the allowed group on initial login'
  );
  assert(
    !refreshedClaims.groups.includes(ALLOWED_GROUP),
    'refresh-loses-group profile should remove the allowed group on refresh'
  );
}

async function checkNoRefreshToken() {
  await setProfile('no-refresh-token');
  const { tokens } = await runAuthorizationCodeFlow();
  assert(!tokens.refresh_token, 'no-refresh-token profile should not issue a refresh token');
}

async function checkMissingIdToken() {
  await setProfile('missing-id-token');
  const { tokens } = await runAuthorizationCodeFlow();
  assert(!tokens.id_token, 'missing-id-token profile should omit id_token');
}

async function checkLogoutRedirectRegistered() {
  await setProfile('happy');
  const { tokens } = await runAuthorizationCodeFlow();
  const logoutUrl = new URL(`${issuer}/session/end`);

  logoutUrl.search = new URLSearchParams({
    id_token_hint: tokens.id_token,
    post_logout_redirect_uri: new URL('/login', redirectUri).toString(),
  }).toString();

  const response = await http('GET', logoutUrl.toString());
  assert(
    response.status !== 400 && !response.body.includes('post_logout_redirect_uri not registered'),
    'logout should accept the registered /login post_logout_redirect_uri'
  );
}

const checks = [
  ['happy', checkHappy],
  ['huge-groups', checkHugeGroups],
  ['no-groups-claim', checkNoGroupsClaim],
  ['groups-string', checkGroupsString],
  ['single-group-string', checkSingleGroupString],
  ['member-of-groups', checkMemberOfGroups],
  ['refresh-loses-group', checkRefreshLosesGroup],
  ['no-refresh-token', checkNoRefreshToken],
  ['missing-id-token', checkMissingIdToken],
  ['logout-redirect', checkLogoutRedirectRegistered],
];

for (const [name, check] of checks) {
  await check();
  console.log(`ok ${name}`);
}

await setProfile('happy');
