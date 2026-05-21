export const DEFAULT_ISSUER = 'http://localhost:9001';
export const DEFAULT_REDIRECT_URI = 'http://localhost:8000/sso-callback';
export const DEFAULT_CLIENT_ID = 'local-oidc-client';
export const DEFAULT_SCOPES = 'openid profile email groups offline_access';
export const ALLOWED_GROUP = process.env.QA_OIDC_ALLOWED_GROUP ?? 'qa-users';

const baseProfile = {
  sub: 'qa-user-1',
  name: 'Local OIDC QA User',
  email: 'local-oidc-qa@example.test',
  groups: [ALLOWED_GROUP, 'engineering'],
  refreshGroups: null,
  userinfoGroups: null,
  userinfoSub: null,
  expSeconds: 300,
  refreshExpSeconds: null,
  accessTokenSeconds: 300,
  refreshTokenSeconds: 3600,
  hugeGroupsCount: 0,
  includeAllowedGroupInHugeGroups: true,
  groupsClaimShape: 'array',
  emailVerified: true,
  issueRefreshToken: true,
  rotateRefreshToken: true,
  omitIdToken: false,
};

export const profileCases = {
  happy: {
    ...baseProfile,
    description: 'Allowed user with normal groups and refresh support.',
  },
  'huge-groups': {
    ...baseProfile,
    description: 'Allowed user with a very large groups claim to test large-claim handling.',
    hugeGroupsCount: 700,
  },
  'missing-group': {
    ...baseProfile,
    description: 'User is authenticated by the provider but is missing the configured allowed group.',
    groups: ['finance', 'support'],
  },
  'no-groups-claim': {
    ...baseProfile,
    description: 'Allowed user data exists, but the provider omits the groups claim.',
    groupsClaimShape: 'omitted',
  },
  'groups-string': {
    ...baseProfile,
    description: 'Provider returns groups as a comma-separated string instead of an array.',
    groupsClaimShape: 'string',
  },
  'single-group-string': {
    ...baseProfile,
    description: 'Provider returns one group as a string instead of an array.',
    groups: [ALLOWED_GROUP],
    groupsClaimShape: 'single-string',
  },
  'unverified-email': {
    ...baseProfile,
    description: 'Allowed user with email_verified=false.',
    emailVerified: false,
  },
  'short-expiry': {
    ...baseProfile,
    description: 'Allowed user with a short ID token lifetime for refresh testing.',
    expSeconds: 8,
    refreshExpSeconds: 300,
  },
  'refresh-loses-group': {
    ...baseProfile,
    description: 'Initial login is allowed, but the refreshed ID token loses the allowed group.',
    expSeconds: 8,
    refreshExpSeconds: 300,
    refreshGroups: ['finance', 'support'],
  },
  'no-refresh-token': {
    ...baseProfile,
    description: 'Allowed login but no refresh token is issued.',
    expSeconds: 8,
    issueRefreshToken: false,
  },
  'userinfo-groups': {
    ...baseProfile,
    description: 'ID token has no allowed group, userinfo has the allowed group.',
    groups: ['finance', 'support'],
    userinfoGroups: [ALLOWED_GROUP, 'from-userinfo'],
  },
  'userinfo-denied': {
    ...baseProfile,
    description: 'ID token is allowed, userinfo overrides groups with a denied group set.',
    userinfoGroups: ['finance', 'support'],
  },
  'missing-id-token': {
    ...baseProfile,
    description: 'Token endpoint omits id_token to exercise callback/refresh invalid-token handling.',
    omitIdToken: true,
  },
  'userinfo-sub-mismatch': {
    ...baseProfile,
    description: 'Userinfo returns a different subject from the ID token.',
    userinfoSub: 'different-user',
  },
  'refresh-reuses-token': {
    ...baseProfile,
    description: 'Refresh succeeds without refresh-token rotation.',
    expSeconds: 8,
    refreshExpSeconds: 300,
    rotateRefreshToken: false,
  },
};

export function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile));
}

export function profileNames() {
  return Object.keys(profileCases);
}

export function getProfileCase(name) {
  const profile = profileCases[name];
  if (!profile) {
    return null;
  }
  return cloneProfile(profile);
}

export function mergeProfile(currentProfile, patch) {
  return {
    ...currentProfile,
    ...patch,
  };
}

export function buildGroups(profile, { refresh = false, userinfo = false } = {}) {
  if (userinfo && Array.isArray(profile.userinfoGroups)) {
    return [...profile.userinfoGroups];
  }

  if (refresh && Array.isArray(profile.refreshGroups)) {
    return [...profile.refreshGroups];
  }

  const groups = [...(profile.groups ?? [])];

  for (let i = 0; i < (profile.hugeGroupsCount ?? 0); i += 1) {
    groups.push(`qa-large-group-${String(i).padStart(4, '0')}`);
  }

  if (profile.includeAllowedGroupInHugeGroups && profile.hugeGroupsCount > 0 && !groups.includes(ALLOWED_GROUP)) {
    groups.push(ALLOWED_GROUP);
  }

  return groups;
}

export function groupClaimValue(profile, groups) {
  if (profile.groupsClaimShape === 'omitted') {
    return undefined;
  }

  if (profile.groupsClaimShape === 'string') {
    return groups.join(',');
  }

  if (profile.groupsClaimShape === 'single-string') {
    return groups[0] ?? '';
  }

  return groups;
}

export function isRefreshGrant(ctx) {
  return ctx?.oidc?.params?.grant_type === 'refresh_token';
}

export function tokenTtlSeconds(profile, ctx) {
  if (isRefreshGrant(ctx) && profile.refreshExpSeconds !== null && profile.refreshExpSeconds !== undefined) {
    return profile.refreshExpSeconds;
  }

  return profile.expSeconds;
}
