import logging
from pathlib import Path

import pytest

from dara.core.internal import signing_key
from dara.core.internal.settings import PROCESS_JWT_SECRET, Settings, get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _clear_runtime_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv('DARA_TEST_FLAG', raising=False)
    monkeypatch.delenv('JWT_SECRET', raising=False)
    monkeypatch.delenv('DARA_BASE_URL', raising=False)
    monkeypatch.delenv('AUTH_SESSION_MAX_AGE_SECONDS', raising=False)
    monkeypatch.delenv('DARA_DOCKER_MODE', raising=False)
    monkeypatch.delenv('DARA_PRODUCTION_MODE', raising=False)
    monkeypatch.delenv('DARA_CONFIG_PATH', raising=False)
    monkeypatch.delenv('DARA_OTEL_ENABLED', raising=False)
    monkeypatch.delenv('DARA_OTEL_SHUTDOWN_TIMEOUT_MILLIS', raising=False)
    monkeypatch.delenv('DARA_METRICS_PORT', raising=False)
    monkeypatch.delenv('DARA_DISABLE_METRICS', raising=False)
    monkeypatch.delenv('OTEL_METRICS_EXPORTER', raising=False)
    monkeypatch.delenv('OTEL_SEMCONV_STABILITY_OPT_IN', raising=False)


@pytest.mark.parametrize(
    ('otel_enabled', 'metrics_disabled', 'otel_exporter', 'otlp_metrics', 'prometheus_metrics'),
    [
        (False, False, 'otlp', False, True),
        (False, True, 'otlp', False, False),
        (True, False, 'otlp', True, True),
        (True, True, 'otlp', True, False),
        (True, False, 'prometheus', False, True),
        (True, False, 'none', False, True),
    ],
)
def test_metrics_transports_follow_existing_switches(
    otel_enabled: bool,
    metrics_disabled: bool,
    otel_exporter: str,
    otlp_metrics: bool,
    prometheus_metrics: bool,
):
    """Dara and standard OTEL switches independently select each transport."""
    settings = Settings(
        _env_file=None,
        dara_otel_enabled=otel_enabled,
        dara_disable_metrics=metrics_disabled,
        otel_metrics_exporter=otel_exporter,
    )

    assert settings.otlp_metrics_enabled is otlp_metrics
    assert settings.prometheus_metrics_enabled is prometheus_metrics


def test_disable_metrics_only_overrides_prometheus_compatibility_endpoint():
    """The Prometheus server flag does not unexpectedly disable OTLP metrics."""
    settings = Settings(
        _env_file=None,
        dara_disable_metrics=True,
        dara_otel_enabled=True,
        otel_metrics_exporter='otlp',
    )

    assert settings.otlp_metrics_enabled is True
    assert settings.prometheus_metrics_enabled is False


def test_otel_shutdown_timeout_uses_dara_settings(monkeypatch: pytest.MonkeyPatch):
    """The telemetry shutdown deadline is configurable and must remain positive."""
    monkeypatch.setenv('DARA_OTEL_SHUTDOWN_TIMEOUT_MILLIS', '1250')

    assert Settings(_env_file=None).dara_otel_shutdown_timeout_millis == 1250

    with pytest.raises(ValueError):
        Settings(_env_file=None, dara_otel_shutdown_timeout_millis=0)


def _use_cache_dir(monkeypatch: pytest.MonkeyPatch, cache_dir: Path):
    monkeypatch.setattr(signing_key, 'user_cache_path', lambda appname: cache_dir / appname)


def _get_log_content(caplog: pytest.LogCaptureFixture, title: str) -> dict:
    for record in reversed(caplog.records):
        if isinstance(record.msg, dict) and record.msg.get('title') == title:
            content = getattr(record, 'content', None)
            assert content is None or isinstance(content, dict)
            return content or {}
    raise AssertionError(f'Log record not found: {title}')


def test_settings_configured_jwt_secret_env_wins(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv('JWT_SECRET', 'configured-secret')

    settings = get_settings()

    assert settings.jwt_secret == 'configured-secret'
    assert not signing_key.get_dev_signing_key_path().exists()


def test_settings_configured_jwt_secret_dotenv_wins(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    monkeypatch.chdir(tmp_path)
    Path('.env').write_text('JWT_SECRET=dotenv-secret\n', encoding='utf-8')

    settings = get_settings()

    assert settings.jwt_secret == 'dotenv-secret'
    assert not signing_key.get_dev_signing_key_path().exists()


def test_settings_dotenv_non_jwt_values_load_with_generated_dev_secret(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    monkeypatch.chdir(tmp_path)
    Path('.env').write_text(
        'DARA_BASE_URL=http://example.test\nAUTH_SESSION_MAX_AGE_SECONDS=123\n',
        encoding='utf-8',
    )

    settings = get_settings()

    assert settings.dara_base_url == 'http://example.test'
    assert settings.auth_session_max_age_seconds == 123
    assert settings.jwt_secret == signing_key.get_dev_signing_key_path().read_text(encoding='utf-8')


def test_settings_missing_local_jwt_secret_is_generated_once_and_reused(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    monkeypatch.chdir(tmp_path)

    first_settings = get_settings()
    secret_path = signing_key.get_dev_signing_key_path()
    get_settings.cache_clear()
    second_settings = get_settings()

    assert first_settings.jwt_secret == second_settings.jwt_secret
    assert secret_path.read_text(encoding='utf-8') == first_settings.jwt_secret
    assert not Path('.env').exists()


def test_settings_dev_jwt_secret_scope_uses_config_module_path(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    app_root = tmp_path / 'app-root'
    app_package = app_root / 'my_app'
    launch_a = tmp_path / 'launch-a'
    launch_b = tmp_path / 'launch-b'
    app_package.mkdir(parents=True)
    launch_a.mkdir()
    launch_b.mkdir()
    (app_package / '__init__.py').write_text('', encoding='utf-8')
    (app_package / 'main.py').write_text('config = object()\n', encoding='utf-8')
    monkeypatch.syspath_prepend(str(app_root))
    monkeypatch.setenv('DARA_CONFIG_PATH', 'my_app.main:config')

    monkeypatch.chdir(launch_a)
    first_settings = get_settings()
    first_path = signing_key.get_dev_signing_key_path()
    get_settings.cache_clear()

    monkeypatch.chdir(launch_b)
    second_settings = get_settings()
    second_path = signing_key.get_dev_signing_key_path()

    assert first_path == second_path
    assert first_path.read_text(encoding='utf-8') == first_settings.jwt_secret
    assert second_settings.jwt_secret == first_settings.jwt_secret


def test_settings_dev_jwt_secret_scope_uses_raw_config_path_when_module_resolution_fails(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    launch_a = tmp_path / 'launch-a'
    launch_b = tmp_path / 'launch-b'
    launch_a.mkdir()
    launch_b.mkdir()
    monkeypatch.setenv('DARA_CONFIG_PATH', 'missing_app.main:config')

    monkeypatch.chdir(launch_a)
    first_path = signing_key.get_dev_signing_key_path()

    monkeypatch.chdir(launch_b)
    second_path = signing_key.get_dev_signing_key_path()

    assert first_path == second_path


def test_settings_dev_jwt_secret_scope_falls_back_to_cwd_without_config_path(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    project_a = tmp_path / 'project-a'
    project_b = tmp_path / 'project-b'
    project_a.mkdir()
    project_b.mkdir()

    monkeypatch.chdir(project_a)
    first_path = signing_key.get_dev_signing_key_path()

    monkeypatch.chdir(project_b)
    second_path = signing_key.get_dev_signing_key_path()

    assert first_path != second_path


def test_settings_unwritable_dev_secret_storage_warns_and_does_not_mutate_cwd(monkeypatch, tmp_path, caplog):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        signing_key, '_create_dev_signing_key', lambda path: (_ for _ in ()).throw(PermissionError('denied'))
    )
    caplog.set_level(logging.WARNING, logger='dara.dev')

    settings = get_settings()

    assert settings.jwt_secret == PROCESS_JWT_SECRET
    assert not Path('.env').exists()
    log_content = _get_log_content(
        caplog,
        (
            'Failed to persist local development JWT_SECRET. Local auth sessions will not survive process restart '
            'until JWT_SECRET is configured or the Dara user cache directory is writable.'
        ),
    )
    assert log_content['path'] == str(signing_key.get_dev_signing_key_path())
    assert log_content['reason'] == 'denied'


def test_settings_production_missing_jwt_secret_warns_and_uses_process_fallback(monkeypatch, tmp_path, caplog):
    _clear_runtime_env(monkeypatch)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv('DARA_DOCKER_MODE', 'TRUE')
    caplog.set_level(logging.WARNING, logger='dara.dev')

    settings = get_settings()

    assert settings.jwt_secret == PROCESS_JWT_SECRET
    assert (
        _get_log_content(
            caplog,
            'JWT_SECRET is not explicitly configured. Dara generated a fallback secret. '
            'This is not suitable for production because sessions may be invalidated on restart. '
            'Set JWT_SECRET via environment or a mounted secret file.',
        )
        == {}
    )


def test_settings_test_flag_keeps_dotenv_test_precedence(monkeypatch):
    monkeypatch.setenv('DARA_TEST_FLAG', 'True')
    monkeypatch.setenv('JWT_SECRET', 'ambient-secret')

    settings = get_settings()

    assert settings.jwt_secret == 'd6446c35450e31c4d0b48351c0423bf9'


def test_settings_loads_telemetry_configuration(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv('DARA_OTEL_ENABLED', 'TRUE')
    monkeypatch.setenv('OTEL_SEMCONV_STABILITY_OPT_IN', 'http/dup')

    settings = get_settings()

    assert settings.dara_otel_enabled is True
    assert settings.otel_semconv_stability_opt_in == 'http/dup'


def test_settings_telemetry_defaults_to_disabled(monkeypatch, tmp_path):
    _clear_runtime_env(monkeypatch)
    _use_cache_dir(monkeypatch, tmp_path / 'cache')
    monkeypatch.chdir(tmp_path)

    settings = get_settings()

    assert settings.dara_otel_enabled is False
    assert settings.otel_semconv_stability_opt_in == 'http'
