import pytest
from pydantic import ValidationError

from dara.core.auth.oidc.settings import OIDCSettings, get_oidc_settings


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


def test_error_on_missing_env():
    """
    Check that the settings error out on missing env vars
    """
    with pytest.raises(ValidationError):
        OIDCSettings(_env_file=None)  # disable env loading # type: ignore
