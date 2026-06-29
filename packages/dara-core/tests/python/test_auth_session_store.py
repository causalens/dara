import hashlib
import json
from datetime import datetime, timezone
from unittest import mock

import pytest
from freezegun import freeze_time

import dara.core.auth.session_store as session_store_module
from dara.core.auth.definitions import TokenData
from dara.core.auth.session_store import ExpiredAuthSession, FileAuthSessionBackend

pytestmark = pytest.mark.anyio


def token_data(session_id: str = 'session-1', exp: float | None = None) -> TokenData:
    return TokenData(
        session_id=session_id,
        exp=exp if exp is not None else datetime.now(tz=timezone.utc).timestamp() + 3600,
        identity_id='PERSONA_ID',
        identity_name='USERNAME',
        identity_email='username@causalens.com',
        groups=['dev'],
    )


def timestamp_datetime(timestamp: float) -> datetime:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc)


def session_file(root, session_token: str):
    return root / f'{hashlib.sha256(session_token.encode()).hexdigest()}.json'


async def test_file_auth_session_backend_persists_sessions_across_instances(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)

    with mock.patch('dara.core.auth.session_store.generate_auth_session_token', return_value='opaque-session-token'):
        session_token = await backend.create('raw-auth-token', token_data(), refresh_token='refresh-token')

    assert session_token == 'opaque-session-token'
    assert await FileAuthSessionBackend(path=tmp_path).get(session_token) is not None


async def test_file_auth_session_backend_hashes_session_token_in_filename(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)

    with mock.patch('dara.core.auth.session_store.generate_auth_session_token', return_value='secret-session-token'):
        session_token = await backend.create('raw-auth-token', token_data())

    files = list(tmp_path.iterdir())
    assert len(files) == 1
    assert files[0].name == f'{hashlib.sha256(session_token.encode()).hexdigest()}.json'
    assert session_token not in files[0].name


async def test_file_auth_session_backend_returns_expired_session_until_retention_expires(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)

    with freeze_time(timestamp_datetime(99.0)) as frozen_time:
        with mock.patch('dara.core.auth.session_store.generate_auth_session_token', return_value='token-1'):
            session_token = await backend.create('raw-auth-token', token_data(exp=100.0))

        frozen_time.move_to(timestamp_datetime(100.5))
        stored_session = await FileAuthSessionBackend(path=tmp_path).get(session_token)
        assert isinstance(stored_session, ExpiredAuthSession)
        assert stored_session.auth_token == 'raw-auth-token'

        frozen_time.move_to(timestamp_datetime(160.1))
        assert await FileAuthSessionBackend(path=tmp_path).get(session_token) is None
        assert not session_file(tmp_path, session_token).exists()


async def test_file_auth_session_backend_set_updates_existing_session(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)
    old_token_data = token_data()
    new_token_data = old_token_data.model_copy(update={'identity_name': 'UPDATED_USERNAME'})

    with freeze_time(timestamp_datetime(100.0)) as frozen_time:
        with mock.patch('dara.core.auth.session_store.generate_auth_session_token', return_value='token-1'):
            session_token = await backend.create('auth-token-1', old_token_data)

        frozen_time.move_to(timestamp_datetime(110.0))
        assert await FileAuthSessionBackend(path=tmp_path).set(session_token, 'auth-token-2', new_token_data)

    stored_session = await FileAuthSessionBackend(path=tmp_path).get(session_token)
    assert stored_session is not None
    assert stored_session.auth_token == 'auth-token-2'
    assert stored_session.token_data == new_token_data


async def test_file_auth_session_backend_set_does_not_create_missing_session(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)

    with freeze_time(timestamp_datetime(100.0)):
        assert not await backend.set('missing-token', 'auth-token-1', token_data())

    assert not list(tmp_path.iterdir())


async def test_file_auth_session_backend_remove_deletes_session_file(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)

    with mock.patch('dara.core.auth.session_store.generate_auth_session_token', return_value='token-1'):
        session_token = await backend.create('raw-auth-token', token_data())

    assert session_file(tmp_path, session_token).exists()
    removed_session = await backend.remove(session_token)
    assert removed_session is not None
    assert removed_session.auth_token == 'raw-auth-token'
    assert not session_file(tmp_path, session_token).exists()


async def test_file_auth_session_backend_ignores_malformed_and_oversized_files(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)
    malformed_path = session_file(tmp_path, 'malformed-token')
    oversized_path = session_file(tmp_path, 'oversized-token')

    malformed_path.write_text('{bad json', encoding='utf-8')
    oversized_path.write_text('x' * (1024 * 1024 + 1), encoding='utf-8')

    assert await backend.get('malformed-token') is None
    assert await backend.get('oversized-token') is None
    assert malformed_path.exists()
    assert oversized_path.exists()


async def test_file_auth_session_backend_clear_removes_valid_session_files(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)

    with mock.patch('dara.core.auth.session_store.generate_auth_session_token', side_effect=['token-1', 'token-2']):
        await backend.create('auth-token-1', token_data(session_id='session-1'))
        await backend.create('auth-token-2', token_data(session_id='session-2'))

    await FileAuthSessionBackend(path=tmp_path).clear()
    assert not list(tmp_path.iterdir())


async def test_file_auth_session_backend_clear_expired_preserves_active_sessions(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)

    with freeze_time(timestamp_datetime(99.0)) as frozen_time:
        with mock.patch('dara.core.auth.session_store.generate_auth_session_token', side_effect=['token-1', 'token-2']):
            expired_session_token = await backend.create('auth-token-1', token_data(session_id='session-1', exp=100.0))
            active_session_token = await backend.create('auth-token-2', token_data(session_id='session-2', exp=300.0))

        frozen_time.move_to(timestamp_datetime(160.1))
        await FileAuthSessionBackend(path=tmp_path).clear_expired()

    assert not session_file(tmp_path, expired_session_token).exists()
    assert session_file(tmp_path, active_session_token).exists()


async def test_file_auth_session_backend_writes_complete_json_snapshots(tmp_path):
    backend = FileAuthSessionBackend(path=tmp_path)

    with mock.patch('dara.core.auth.session_store.generate_auth_session_token', return_value='token-1'):
        session_token = await backend.create('auth-token-1', token_data())

    assert await backend.set(session_token, 'auth-token-2', token_data(session_id='session-2'))

    with session_file(tmp_path, session_token).open('r', encoding='utf-8') as file:
        payload = json.load(file)

    assert payload['auth_token'] == 'auth-token-2'
    assert payload['token_data']['session_id'] == 'session-2'


def test_file_auth_session_backend_requires_explicit_path_to_exist(tmp_path):
    missing_path = tmp_path / 'missing'

    with pytest.raises(RuntimeError, match='does not exist'):
        FileAuthSessionBackend(path=missing_path)


def test_file_auth_session_backend_uses_env_path(monkeypatch, tmp_path):
    monkeypatch.setenv('DARA_AUTH_SESSION_FILE_PATH', str(tmp_path))

    backend = FileAuthSessionBackend()

    assert backend.root == tmp_path.resolve()


def test_file_auth_session_backend_explicit_path_overrides_env_path(monkeypatch, tmp_path):
    env_path = tmp_path / 'env'
    explicit_path = tmp_path / 'explicit'
    env_path.mkdir()
    explicit_path.mkdir()
    monkeypatch.setenv('DARA_AUTH_SESSION_FILE_PATH', str(env_path))

    backend = FileAuthSessionBackend(path=explicit_path)

    assert backend.root == explicit_path.resolve()


def test_file_auth_session_backend_default_root_uses_config_module_scope(monkeypatch, tmp_path):
    temp_root = tmp_path / 'temp'
    app_root = tmp_path / 'app-root'
    app_package = app_root / 'my_app'
    launch_a = tmp_path / 'launch-a'
    launch_b = tmp_path / 'launch-b'
    temp_root.mkdir()
    app_package.mkdir(parents=True)
    launch_a.mkdir()
    launch_b.mkdir()
    (app_package / '__init__.py').write_text('', encoding='utf-8')
    (app_package / 'main.py').write_text('config = object()\n', encoding='utf-8')
    monkeypatch.delenv('DARA_AUTH_SESSION_FILE_PATH', raising=False)
    monkeypatch.syspath_prepend(str(app_root))
    monkeypatch.setenv('DARA_CONFIG_PATH', 'my_app.main:config')
    monkeypatch.setattr(session_store_module.tempfile, 'gettempdir', lambda: str(temp_root))

    monkeypatch.chdir(launch_a)
    first_root = FileAuthSessionBackend().root

    monkeypatch.chdir(launch_b)
    second_root = FileAuthSessionBackend().root

    assert first_root == second_root
    assert first_root.parent == temp_root / 'dara-sessions'
