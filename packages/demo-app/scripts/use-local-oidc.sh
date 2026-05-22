#!/usr/bin/env sh

use_userinfo=false
group_claim_name=groups

while [ "$#" -gt 0 ]; do
  arg="$1"
  case "$arg" in
    --userinfo)
      use_userinfo=true
      shift
      ;;
    --group-claim-name)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for --group-claim-name" >&2
        echo "Usage: source scripts/use-local-oidc.sh [--userinfo] [--group-claim-name CLAIM]" >&2
        return 2 2>/dev/null || exit 2
      fi
      group_claim_name="$1"
      shift
      ;;
    --group-claim-name=*)
      group_claim_name="${arg#--group-claim-name=}"
      shift
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: source scripts/use-local-oidc.sh [--userinfo] [--group-claim-name CLAIM]" >&2
      return 2 2>/dev/null || exit 2
      ;;
  esac
done

export QA_OIDC_ISSUER="${QA_OIDC_ISSUER:-http://localhost:9001}"
export QA_OIDC_CLIENT_ID="${QA_OIDC_CLIENT_ID:-local-oidc-client}"
export QA_OIDC_REDIRECT_URI="${QA_OIDC_REDIRECT_URI:-http://localhost:8000/sso-callback}"
export QA_OIDC_ALLOWED_GROUP="${QA_OIDC_ALLOWED_GROUP:-qa-users}"
export QA_OIDC_SCOPES="${QA_OIDC_SCOPES:-openid profile email groups offline_access}"

export SSO_ISSUER_URL="$QA_OIDC_ISSUER"
export SSO_CLIENT_ID="$QA_OIDC_CLIENT_ID"
export SSO_CLIENT_AUTH_MODE=pkce_public
export SSO_REDIRECT_URI="$QA_OIDC_REDIRECT_URI"
export SSO_GROUPS="$QA_OIDC_ALLOWED_GROUP"
export SSO_GROUP_CLAIM_NAME="$group_claim_name"
export SSO_SCOPES="$QA_OIDC_SCOPES"
export SSO_JWT_ALGO=RS256
unset SSO_CLIENT_SECRET

if [ "$use_userinfo" = true ]; then
  export SSO_USE_USERINFO=true
else
  unset SSO_USE_USERINFO
fi

echo "Configured demo-app for local OIDC provider:"
echo "  SSO_ISSUER_URL=$SSO_ISSUER_URL"
echo "  SSO_CLIENT_ID=$SSO_CLIENT_ID"
echo "  SSO_REDIRECT_URI=$SSO_REDIRECT_URI"
echo "  SSO_GROUPS=$SSO_GROUPS"
echo "  SSO_GROUP_CLAIM_NAME=$SSO_GROUP_CLAIM_NAME"
echo "  SSO_USE_USERINFO=${SSO_USE_USERINFO:-false}"
