import pytest
from pydantic import ValidationError

from dara.core.auth.oidc.settings import DEFAULT_ID_TOKEN_SIGNING_ALG, OIDCSettings, get_oidc_settings


@pytest.fixture(autouse=True)
def clear_settings():
    get_oidc_settings.cache_clear()
    yield


def test_env_test_content(monkeypatch: pytest.MonkeyPatch):
    """
    Test that the .env.test file is loaded correctly since tests run with DARA_TEST_FLAG set
    """
    with monkeypatch.context() as m:
        m.setenv('DARA_TEST_FLAG', 'True')
        s = get_oidc_settings()
        assert s.client_id == 'CLIENT_ID'
        assert s.client_secret == 'CLIENT_SECRET'


def test_audience_override(monkeypatch: pytest.MonkeyPatch):
    with monkeypatch.context() as m:
        m.setenv('SSO_CLIEND_ID', 'client_test_id')
        m.setenv('SSO_AUDIENCE_CLIENT_ID', 'aud123')
        m.setenv('SSO_AUDIENCE_CLIENT_SECRET', 'audsecret')
        s = get_oidc_settings()
        assert s.client_id == 'aud123'
        assert s.verify_audience is True


def test_client_secret_required_for_default_auth_mode():
    with pytest.raises(ValidationError):
        OIDCSettings(
            _env_file=None,  # type: ignore
            client_id='client-id',
            redirect_uri='http://localhost:8000/sso-callback',
            groups='dev',
        )


def test_client_secret_not_required_for_pkce_public_auth_mode():
    s = OIDCSettings(
        _env_file=None,  # type: ignore
        client_id='client-id',
        client_auth_mode='pkce_public',
        redirect_uri='http://localhost:8000/sso-callback',
        groups='dev',
    )

    assert s.client_secret is None
    assert s.client_auth_mode == 'pkce_public'


def test_group_claim_name_defaults_to_groups():
    s = OIDCSettings(
        _env_file=None,  # type: ignore
        client_id='client-id',
        client_secret='client-secret',
        redirect_uri='http://localhost:8000/sso-callback',
        groups='dev',
    )

    assert s.group_claim_name == 'groups'


def test_id_token_signing_alg_defaults_to_rs256():
    s = OIDCSettings(
        _env_file=None,  # type: ignore
        client_id='client-id',
        client_secret='client-secret',
        redirect_uri='http://localhost:8000/sso-callback',
        groups='dev',
    )

    assert s.id_token_signed_response_alg is None
    assert s.jwt_algo is None
    assert s.fallback_id_token_signed_response_alg == DEFAULT_ID_TOKEN_SIGNING_ALG


def test_id_token_signing_alg_takes_precedence_over_legacy_jwt_algo():
    s = OIDCSettings(
        _env_file=None,  # type: ignore
        client_id='client-id',
        client_secret='client-secret',
        redirect_uri='http://localhost:8000/sso-callback',
        groups='dev',
        id_token_signed_response_alg='RS256',
        jwt_algo='ES256',
    )

    assert s.fallback_id_token_signed_response_alg == 'RS256'


def test_legacy_jwt_algo_is_used_when_id_token_signing_alg_is_not_configured():
    s = OIDCSettings(
        _env_file=None,  # type: ignore
        client_id='client-id',
        client_secret='client-secret',
        redirect_uri='http://localhost:8000/sso-callback',
        groups='dev',
        jwt_algo='ES256',
    )

    assert s.fallback_id_token_signed_response_alg == 'ES256'


@pytest.mark.parametrize('alg_field', ['id_token_signed_response_alg', 'jwt_algo'])
def test_none_id_token_signing_alg_is_rejected(alg_field: str):
    with pytest.raises(ValidationError, match='OIDC ID token signing algorithm "none" is not supported'):
        OIDCSettings(
            _env_file=None,  # type: ignore
            client_id='client-id',
            client_secret='client-secret',
            redirect_uri='http://localhost:8000/sso-callback',
            groups='dev',
            **{alg_field: 'none'},
        )


@pytest.mark.parametrize('alg_field', ['id_token_signed_response_alg', 'jwt_algo'])
def test_hmac_id_token_signing_alg_is_rejected(alg_field: str):
    with pytest.raises(ValidationError, match='OIDC ID token HMAC signing algorithms are not supported'):
        OIDCSettings(
            _env_file=None,  # type: ignore
            client_id='client-id',
            client_secret='client-secret',
            redirect_uri='http://localhost:8000/sso-callback',
            groups='dev',
            **{alg_field: 'HS256'},
        )


def test_id_token_signing_alg_prefers_new_prefixed_env_alias(monkeypatch: pytest.MonkeyPatch):
    with monkeypatch.context() as m:
        m.setenv('SSO_ID_TOKEN_SIGNED_RESPONSE_ALG', 'RS256')
        m.setenv('SSO_JWT_ALGO', 'ES256')

        s = OIDCSettings(
            _env_file=None,  # type: ignore
            client_id='client-id',
            client_secret='client-secret',
            redirect_uri='http://localhost:8000/sso-callback',
            groups='dev',
        )

        assert s.id_token_signed_response_alg == 'RS256'
        assert s.jwt_algo == 'RS256'
        assert s.fallback_id_token_signed_response_alg == 'RS256'


def test_id_token_signing_alg_accepts_legacy_prefixed_env_alias(monkeypatch: pytest.MonkeyPatch):
    with monkeypatch.context() as m:
        m.delenv('SSO_ID_TOKEN_SIGNED_RESPONSE_ALG', raising=False)
        m.setenv('SSO_JWT_ALGO', 'ES256')

        s = OIDCSettings(
            _env_file=None,  # type: ignore
            client_id='client-id',
            client_secret='client-secret',
            redirect_uri='http://localhost:8000/sso-callback',
            groups='dev',
        )

        assert s.id_token_signed_response_alg == 'ES256'
        assert s.jwt_algo == 'ES256'
        assert s.fallback_id_token_signed_response_alg == 'ES256'


def test_id_token_signing_alg_ignores_unprefixed_env_aliases(monkeypatch: pytest.MonkeyPatch):
    with monkeypatch.context() as m:
        m.delenv('SSO_ID_TOKEN_SIGNED_RESPONSE_ALG', raising=False)
        m.delenv('SSO_JWT_ALGO', raising=False)
        m.setenv('ID_TOKEN_SIGNED_RESPONSE_ALG', 'ES256')
        m.setenv('JWT_ALGO', 'ES256')

        s = OIDCSettings(
            _env_file=None,  # type: ignore
            client_id='client-id',
            client_secret='client-secret',
            redirect_uri='http://localhost:8000/sso-callback',
            groups='dev',
        )

        assert s.id_token_signed_response_alg is None
        assert s.jwt_algo is None
        assert s.fallback_id_token_signed_response_alg == DEFAULT_ID_TOKEN_SIGNING_ALG


def test_group_claim_name_can_be_configured_from_env(monkeypatch: pytest.MonkeyPatch):
    with monkeypatch.context() as m:
        m.delenv('DARA_TEST_FLAG', raising=False)
        m.setenv('SSO_CLIENT_ID', 'client-id')
        m.setenv('SSO_CLIENT_SECRET', 'client-secret')
        m.setenv('SSO_REDIRECT_URI', 'http://localhost:8000/sso-callback')
        m.setenv('SSO_GROUPS', 'dev')
        m.setenv('SSO_GROUP_CLAIM_NAME', 'memberOf')

        s = get_oidc_settings()
        assert s.group_claim_name == 'memberOf'


def test_error_on_missing_env():
    """
    Check that the settings error out on missing env vars
    """
    with pytest.raises(ValidationError):
        OIDCSettings(_env_file=None)  # disable env loading # type: ignore
