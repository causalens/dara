from contextlib import contextmanager
from unittest.mock import patch


@contextmanager
def unset_test_flag():
    """
    Context manager to unset the DARA_TEST_FLAG environment variable
    """
    import os

    try:
        os.environ.pop('DARA_TEST_FLAG')
        yield
    finally:
        os.environ['DARA_TEST_FLAG'] = 'true'


@contextmanager
def unset_env_file():
    """
    Context manager to remove the .env file
    """
    import os

    env_content = None

    try:
        # load existing content of cwd/.env
        if os.path.exists('.env'):
            with open('.env', 'r', encoding='utf-8') as f:
                env_content = f.read()
            os.remove('.env')
        yield
    finally:
        if env_content:
            with open('.env', 'w', encoding='utf-8') as f:
                f.write(env_content)


@patch('dara.core.internal.settings.generate_env_file', side_effect=Exception('Failed to generate .env file'))
def test_settings_error_generate_env(mock_generate_env_file):
    """
    Test get_settings() can recover from a failed .env file generation
    """
    from dara.core.internal.settings import get_settings

    get_settings.cache_clear()

    # unsetting test flag to test the proper flow rather than .env.test file
    with unset_test_flag():
        # unsetting .env file to force the function to attempt generating env file
        with unset_env_file():
            settings = get_settings()
            assert settings.jwt_secret is not None
            # make sure we actually tried to generate the file
            mock_generate_env_file.assert_called_once()
