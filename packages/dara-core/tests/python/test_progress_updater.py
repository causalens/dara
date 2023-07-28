import pytest

from dara.core.visual.progress_updater import ProgressUpdater, track_progress


def test_progress_updater_send_decode():
    """
    Test that ProgressUpdater class sends and decodes message correctly
    """
    messages = []

    def send_update(*args):
        nonlocal messages
        messages.append(args)

    progress = 100
    message = 'finished'

    updater = ProgressUpdater(send_update)
    updater.send_update(progress, message)

    # Test sending worked
    assert len(messages) == 1
    assert messages[0] == (100, 'finished')


def test_track_progress_no_annotation():
    """
    Test that @track_progress fails with an error when no ProgressUpdater annotation is present
    """
    with pytest.raises(ValueError) as err:

        @track_progress
        def test_func(arg: str):
            return arg

    assert "Couldn't find an annotation matching the type ProgressUpdater" in str(err.value)


def test_track_progress_no_send_update():
    """
    Test that @track_progress-wrapped function fails when ran manually due to missing __send_update
    """
    with pytest.raises(ValueError) as err:

        @track_progress
        def test_func(arg: str, updater: ProgressUpdater, **kwargs):
            return arg

        test_func('test')

    assert 'Key __send_update not found' in str(err.value)


def test_track_progress_runs_correctly():
    """
    End-to-end test the @track_progress wrapped - check that updates are sent via the method correctly
    """
    messages = []

    def send_update(*args):
        nonlocal messages
        messages.append(args)

    @track_progress
    def test_func(arg: str, updater: ProgressUpdater):
        updater.send_update(100, 'finished')
        return arg

    # Pass pipe manually - this is what is expected to be passed via TaskManager
    test_func('test', __send_update=send_update)

    assert messages == [(100, 'finished')]


def test_track_progress_metadata():
    """
    Test that @track_progress wrapper correctly attaches metadata to the wrapped function
    """

    @track_progress
    def test_function(arg: str, updater: ProgressUpdater):
        return arg

    # Should attach reference to function and decorator - required to later check if a function has been wrapped by track_progress
    assert getattr(test_function, '__wrapped_by__') == track_progress
    assert getattr(test_function, '__wrapped__').__name__ == 'test_function'
