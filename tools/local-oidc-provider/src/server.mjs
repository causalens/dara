import Koa from 'koa';
import mount from 'koa-mount';
import { Provider } from 'oidc-provider';

import {
  ALLOWED_GROUP,
  DEFAULT_CLIENT_ID,
  DEFAULT_ISSUER,
  DEFAULT_POST_LOGOUT_REDIRECT_URI,
  DEFAULT_REDIRECT_URI,
  DEFAULT_SCOPES,
  buildGroups,
  getProfileCase,
  groupClaimValue,
  isRefreshGrant,
  mergeProfile,
  profileCases,
  profileNames,
  tokenTtlSeconds,
} from './profiles.mjs';

const issuer = process.env.QA_OIDC_ISSUER ?? DEFAULT_ISSUER;
const port = Number(new URL(issuer).port || 9001);
const clientId = process.env.QA_OIDC_CLIENT_ID ?? DEFAULT_CLIENT_ID;
const scopes = process.env.QA_OIDC_SCOPES ?? DEFAULT_SCOPES;
const redirectUris = (
  process.env.QA_OIDC_REDIRECT_URIS ?? process.env.QA_OIDC_REDIRECT_URI ?? DEFAULT_REDIRECT_URI
)
  .split(',')
  .map((uri) => uri.trim())
  .filter(Boolean);
const postLogoutRedirectUris = (
  process.env.QA_OIDC_POST_LOGOUT_REDIRECT_URIS ??
  process.env.QA_OIDC_POST_LOGOUT_REDIRECT_URI ??
  DEFAULT_POST_LOGOUT_REDIRECT_URI
)
  .split(',')
  .map((uri) => uri.trim())
  .filter(Boolean);

let activeProfileName = process.env.QA_OIDC_PROFILE ?? 'happy';
let activeProfile = getProfileCase(activeProfileName) ?? getProfileCase('happy');

function currentProfile() {
  return activeProfile;
}

function profileSummary() {
  return {
    activeProfileName,
    activeProfile,
    availableProfiles: profileNames(),
    providerConfig: {
      issuer,
      clientId,
      redirectUris,
      postLogoutRedirectUris,
      scopes,
      allowedGroup: ALLOWED_GROUP,
      tokenEndpointAuthMethod: 'none',
      idTokenSigningAlg: 'RS256',
    },
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function noCache(ctx) {
  ctx.set('Cache-Control', 'no-store');
}

const provider = new Provider(issuer, {
  clients: [
    {
      client_id: clientId,
      application_type: 'web',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: redirectUris,
      post_logout_redirect_uris: postLogoutRedirectUris,
    },
  ],
  claims: {
    openid: ['sub'],
    profile: ['name', 'preferred_username', 'groups', 'identity'],
    email: ['email', 'email_verified'],
    groups: ['groups'],
  },
  conformIdTokenClaims: false,
  cookies: {
    keys: [process.env.QA_OIDC_COOKIE_KEY ?? 'local-oidc-provider-development-cookie-secret'],
  },
  features: {
    devInteractions: { enabled: false },
    rpInitiatedLogout: { enabled: true },
    userinfo: { enabled: true },
  },
  findAccount(ctx, sub) {
    return {
      accountId: sub,
      async claims(use) {
        const profile = currentProfile();
        const refresh = isRefreshGrant(ctx);
        const userinfo = use === 'userinfo';
        const groups = buildGroups(profile, { refresh, userinfo });
        const claims = {
          sub: profile.sub,
          name: profile.name,
          preferred_username: profile.email,
          email: profile.email,
          email_verified: profile.emailVerified,
          groups: groupClaimValue(profile, groups),
          identity: {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
          },
        };

        if (claims.groups === undefined) {
          delete claims.groups;
        }

        return claims;
      },
    };
  },
  async issueRefreshToken(ctx, client, code) {
    const shouldIssue = currentProfile().issueRefreshToken && client.grantTypeAllowed('refresh_token');
    return shouldIssue;
  },
  rotateRefreshToken() {
    return currentProfile().rotateRefreshToken;
  },
  ttl: {
    AccessToken(ctx) {
      return currentProfile().accessTokenSeconds;
    },
    AuthorizationCode() {
      return 60;
    },
    IdToken(ctx) {
      return tokenTtlSeconds(currentProfile(), ctx);
    },
    Interaction() {
      return 300;
    },
    RefreshToken() {
      return currentProfile().refreshTokenSeconds;
    },
    Session() {
      return 3600;
    },
    Grant() {
      return 3600;
    },
  },
});

async function finishInteraction(ctx) {
  const interactionCookieName = provider.cookieName('interaction');
  const interactionCookie = ctx.cookies.get(interactionCookieName);
  const interaction = interactionCookie ? await provider.Interaction.find(interactionCookie) : null;

  if (!interaction) {
    ctx.status = 400;
    ctx.body = 'invalid_request';
    return;
  }

  const grant = new provider.Grant({
    accountId: currentProfile().sub,
    clientId: interaction.params.client_id,
  });

  grant.addOIDCScope(interaction.params.scope ?? 'openid');
  grant.addOIDCClaims(['email', 'email_verified', 'groups', 'identity', 'name', 'preferred_username']);

  const grantId = await grant.save();

  interaction.result = {
    login: {
      accountId: currentProfile().sub,
    },
    consent: {
      grantId,
    },
  };
  await interaction.save(Math.max(interaction.exp - Math.floor(Date.now() / 1000), 1));

  ctx.status = 303;
  ctx.redirect(interaction.returnTo);
}

async function qaRoutes(ctx, next) {
  if (ctx.path === '/__qa/health') {
    noCache(ctx);
    ctx.body = { ok: true };
    return;
  }

  if (ctx.path === '/__qa/profiles') {
    noCache(ctx);
    ctx.body = profileCases;
    return;
  }

  if (ctx.path === '/__qa/profile' && ctx.method === 'GET') {
    noCache(ctx);
    ctx.body = profileSummary();
    return;
  }

  if (ctx.path.startsWith('/__qa/profile/') && ctx.method === 'POST') {
    const nextProfileName = decodeURIComponent(ctx.path.slice('/__qa/profile/'.length));
    const nextProfile = getProfileCase(nextProfileName);

    if (!nextProfile) {
      ctx.status = 404;
      ctx.body = {
        error: `Unknown profile "${nextProfileName}"`,
        availableProfiles: profileNames(),
      };
      return;
    }

    activeProfileName = nextProfileName;
    activeProfile = nextProfile;
    noCache(ctx);
    ctx.body = profileSummary();
    return;
  }

  if (ctx.path === '/__qa/profile' && ctx.method === 'PATCH') {
    const patch = await readJsonBody(ctx.req);
    activeProfileName = 'custom';
    activeProfile = mergeProfile(activeProfile, patch);
    noCache(ctx);
    ctx.body = profileSummary();
    return;
  }

  if (ctx.path.startsWith('/interaction/')) {
    await finishInteraction(ctx);
    return;
  }

  await next();

  if (ctx.path === provider.pathFor('token') && ctx.body && currentProfile().omitIdToken) {
    delete ctx.body.id_token;
  }

  if (ctx.path === provider.pathFor('userinfo') && ctx.body && currentProfile().userinfoSub) {
    ctx.body = {
      ...ctx.body,
      sub: currentProfile().userinfoSub,
    };
  }
}

const app = new Koa();
app.proxy = true;
app.use(qaRoutes);
app.use(mount(provider));

app.listen(port, () => {
  console.log(`Local OIDC provider listening on ${issuer}`);
  console.log(`Discovery: ${issuer}/.well-known/openid-configuration`);
  console.log(`Active profile: ${activeProfileName}`);
  console.log(`Redirect URIs: ${redirectUris.join(', ')}`);
});
