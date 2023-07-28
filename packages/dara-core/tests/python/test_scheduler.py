import datetime
from unittest.mock import MagicMock

import pytest

from dara.core.internal import scheduler


class PickledMock(MagicMock):
    def __reduce__(self):
        return MagicMock, ()


def test_cron_scheduling():
    """Test that a function can be scheduled using a cron expression"""
    mocked_scheduled_function = PickledMock()
    scheduled_job = scheduler.cron('0 0 * * *')
    scheduled_job.continue_running = False
    job_process = scheduled_job.do(mocked_scheduled_function)
    assert job_process.is_alive()
    # Check that an interval has been calculated
    assert scheduled_job.interval > 0
    job_process.join()
    job_process.close()


def test_scheduling_seconds():
    """Test that a function can be scheduled to execute every x seconds"""
    mocked_scheduled_function = PickledMock()
    scheduled_job = scheduler.every(1).seconds()
    scheduled_job.continue_running = False
    job_process = scheduled_job.do(mocked_scheduled_function)
    assert job_process.is_alive()
    job_process.join()
    job_process.close()


def test_scheduling_minutes():
    """Test that a function can be scheduled to execute every x minutes"""
    mocked_scheduled_function = PickledMock()
    scheduled_job = scheduler.every(1).minutes()
    scheduled_job.continue_running = False
    assert scheduled_job.interval == 60
    job_process = scheduled_job.do(mocked_scheduled_function)
    assert job_process.is_alive()
    job_process.join()
    job_process.close()


def test_scheduling_hours():
    """Test that a function can be scheduled to execute every x hours"""
    mocked_scheduled_function = PickledMock()
    scheduled_job = scheduler.every(1).hours()
    scheduled_job.continue_running = False
    assert scheduled_job.interval == 3600
    job_process = scheduled_job.do(mocked_scheduled_function)
    assert job_process.is_alive()
    job_process.join()
    job_process.close()


def test_scheduling_days():
    """Test that a function can be scheduled to execute every x days"""
    mocked_scheduled_function = PickledMock()
    scheduled_job = scheduler.every(1).days()
    scheduled_job.continue_running = False
    assert scheduled_job.interval == 86400
    job_process = scheduled_job.do(mocked_scheduled_function)
    assert job_process.is_alive()
    job_process.join()
    job_process.close()


def test_scheduling_at_specific_time():
    """Test that a function can be scheduled to execute at a specific time of day"""
    mocked_scheduled_function = PickledMock()
    scheduled_job = scheduler.every().day().at('15:15')
    scheduled_job.continue_running = False
    assert scheduled_job.interval == 86400
    assert scheduled_job.job_time == datetime.datetime.strptime('15:15', '%H:%M')
    job_process = scheduled_job.do(mocked_scheduled_function)
    assert job_process.is_alive()
    job_process.join()
    job_process.close()


def test_scheduling_on_specific_weekday():
    """Test that a function can be scheduled to execute on a specific day of the week, every week"""
    mocked_scheduled_function = PickledMock()
    scheduled_job = scheduler.every().monday().at('15:15')
    scheduled_job.continue_running = False
    # The scheduled job should have generated a list with 2 intervals
    assert type(scheduled_job.interval) is list
    assert len(scheduled_job.interval) == 2
    # Check that the second interval is exactly one week in seconds
    assert scheduled_job.interval[1] == 604800
    # The first interval should be the number of seconds between now and the next Monday
    assert scheduled_job.interval[0] <= 604800
    job_process = scheduled_job.do(mocked_scheduled_function)
    assert job_process.is_alive()
    job_process.join()
    job_process.close()


@pytest.mark.timeout(4)
def test_run_once():
    """Test that a function can be scheduled to run only once"""
    mocked_scheduled_function = PickledMock()
    scheduled_job_process = scheduler.on().second().do(mocked_scheduled_function)
    assert scheduled_job_process.is_alive()
    # If job is only running once, it will take approx 1 second to complete
    scheduled_job_process.join()
    # If joining the test causes the process to hang, the test will exceed the timeout and fail
    scheduled_job_process.close()
