set -l use_userinfo false

for arg in $argv
    switch $arg
        case --userinfo
            set use_userinfo true
        case '*'
            echo "Unknown option: $arg" >&2
            echo "Usage: source scripts/use-local-oidc.fish [--userinfo]" >&2
            return 2
    end
end

set -q QA_OIDC_ISSUER; or set -gx QA_OIDC_ISSUER http://localhost:9001
set -q QA_OIDC_CLIENT_ID; or set -gx QA_OIDC_CLIENT_ID local-oidc-client
set -q QA_OIDC_REDIRECT_URI; or set -gx QA_OIDC_REDIRECT_URI http://localhost:8000/sso-callback
set -q QA_OIDC_ALLOWED_GROUP; or set -gx QA_OIDC_ALLOWED_GROUP qa-users
set -q QA_OIDC_SCOPES; or set -gx QA_OIDC_SCOPES "openid profile email groups offline_access"

set -gx SSO_ISSUER_URL $QA_OIDC_ISSUER
set -gx SSO_CLIENT_ID $QA_OIDC_CLIENT_ID
set -gx SSO_CLIENT_AUTH_MODE pkce_public
set -gx SSO_REDIRECT_URI $QA_OIDC_REDIRECT_URI
set -gx SSO_GROUPS $QA_OIDC_ALLOWED_GROUP
set -gx SSO_SCOPES $QA_OIDC_SCOPES
set -gx SSO_JWT_ALGO RS256
set -e SSO_CLIENT_SECRET

if test "$use_userinfo" = true
    set -gx SSO_USE_USERINFO true
else
    set -e SSO_USE_USERINFO
end

echo "Configured demo-app for local OIDC provider:"
echo "  SSO_ISSUER_URL=$SSO_ISSUER_URL"
echo "  SSO_CLIENT_ID=$SSO_CLIENT_ID"
echo "  SSO_REDIRECT_URI=$SSO_REDIRECT_URI"
echo "  SSO_GROUPS=$SSO_GROUPS"
echo "  SSO_USE_USERINFO="(set -q SSO_USE_USERINFO; and echo $SSO_USE_USERINFO; or echo false)
