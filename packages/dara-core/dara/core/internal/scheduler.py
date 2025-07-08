"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import time
from datetime import datetime
from multiprocessing import get_context
from multiprocessing.process import BaseProcess
from pickle import PicklingError
from typing import Any, List, Optional, Union, cast

from croniter import croniter
from pydantic import BaseModel, field_validator


class ScheduledJob(BaseModel):
    interval: Union[int, List[int]]
    continue_running: bool = True
    first_execution: bool = True
    run_once: bool

    def __init__(self, interval: Union[int, list], run_once=False, **kwargs):
        """
        Creates a ScheduledJob object

        :param interval: The interval between job executions, in seconds
        :param run_once: Whether to run the job only once
        """
        super().__init__(interval=interval, run_once=run_once, **kwargs)

    def do(self, func, args=None) -> BaseProcess:
        """
        Starts the scheduled job process and returns it to the caller. Process is daemonized,
        this ensures that it will be terminated by the parent process on parent exit.

        :param func: The function to be called within the process, must be possible to pickle
        :param args: List of arguments to pass to the function
        """
        if args is None:
            args = []
        try:
            ctx = get_context('spawn')
            job_process = ctx.Process(target=self._refresh_timer, args=(func, args), daemon=True)
            job_process.start()
            return job_process
        except PicklingError as err:
            raise PicklingError(
                """
            Unable to pickle scheduled function. Please ensure that the function you are trying
            to schedule is not in the same file as the ConfigurationBuilder is defined and that
            the function is not a lambda.
            """
            ) from err

    def _refresh_timer(self, func, args):
        while self.continue_running and not (self.run_once and not self.first_execution):
            interval: int
            # If there's more than one interval to wait, i.e. this is a weekday process
            if isinstance(self.interval, list):
                # Wait the first interval if this is the first execution of the job
                interval = self.interval[0] if self.first_execution else self.interval[1]
            else:
                interval = self.interval

            self.first_execution = False
            # Wait the interval and then run the job
            time.sleep(cast(int, interval))
            func(*args)


class CronScheduledJob(ScheduledJob):
    crondef: str

    def __init__(self, crondef: str):
        """
        Creates a CronScheduledJob object

        :param crondef: The cron schedule expression to run the job according to.
        """
        if not croniter.is_valid(crondef):
            raise ValueError('Must provide a valid cron schedule expression.')
        super().__init__(interval=0, run_once=False, crondef=crondef)

    def do(self, func, args=None) -> BaseProcess:
        """
        Starts the scheduled job process and returns it to the caller. Process is daemonized,
        this ensures that it will be terminated by the parent process on parent exit.

        :param func: The function to be called within the process, must be possible to pickle
        :param args: List of arguments to pass to the function
        """
        if args is None:
            args = []
        self._set_new_interval()
        return super().do(self._execute_job_at_time, args=[func, args])

    def _set_new_interval(self):
        cron = croniter(self.crondef)
        # Set croniter's time to match utc
        current_time = datetime.utcnow()
        cron.set_current(current_time)
        # Get the timedelta between now and the next job execution
        time_delta = datetime.utcfromtimestamp(cron.get_next()) - current_time
        # Set the interval
        self.interval = time_delta.seconds

    def _execute_job_at_time(self, func, args):
        func(*args)
        # Update the interval for the next execution
        self._set_new_interval()


class TimeScheduledJob(ScheduledJob):
    job_time: datetime

    def __init__(self, interval: Union[int, list], job_time: str, run_once=False):
        """
        Creates a TimeScheduledJob object

        :param interval: The interval between job executions, in seconds
        :param job_time: A string containing the time at which to execute this job. Must be formatted %H:%M
        """
        super().__init__(interval=interval, job_time=datetime.strptime(job_time, '%H:%M'))

    def do(self, func, args=None) -> BaseProcess:
        """
        Starts the scheduled job process and returns it to the caller. Process is daemonized,
        this ensures that it will be terminated by the parent process on parent exit.

        :param func: The function to be called within the process, must be possible to pickle
        :param args: List of arguments to pass to the function
        """
        if args is None:
            args = []
        return super().do(self._execute_job_at_time, args=[func, args])

    def _execute_job_at_time(self, func, args):
        job_executed = False
        while not job_executed and self.continue_running:
            # First calculate the timedelta
            current_time = datetime.utcnow()
            time_delta = self.job_time - current_time
            # We only care about the number of seconds to the next instance of the required time today
            seconds_to_event = time_delta.seconds
            # If the time has already passed, or is occurring now/within 10 seconds, execute the job
            if seconds_to_event <= 0 or seconds_to_event < 11:
                func(*args)
                job_executed = True
            else:
                # Otherwise, sleep until the event; leaving 10 seconds margin to allow for clock drift/jitter
                time.sleep(seconds_to_event - 10)


class ScheduledJobFactory(BaseModel):
    """
    Factory class for creating different ScheduledJob objects depending on the methods called.

    :param interval: The interval of time to wait between job executions
    :param run_once: Whether the job should be run only once
    """

    interval: Union[int, list]
    continue_running: bool = True
    weekday: Optional[datetime] = None
    run_once: bool

    @field_validator('weekday', mode='before')
    @classmethod
    def validate_weekday(cls, weekday: Any) -> datetime:
        if isinstance(weekday, datetime):
            return weekday
        if isinstance(weekday, str):
            return datetime.strptime(weekday, '%w')
        raise ValueError(f'Invalid weekday {weekday} passed to ScheduledJobFactory')

    def at(self, job_time: str) -> TimeScheduledJob:
        """
        If the job must execute at a specific time of day, this function returns a
        TimeScheduledJob process which will ensure that the job is executed at the given
        time.

        :param job_time: A string containing the time at which to execute this job. Must be formatted %H:%M. Note that this is UTC time.
        """
        # If the job is scheduled to execute on a weekly basis
        if self.weekday is not None:
            # Set 2 intervals, where the first interval is the time from now until the first execution
            interval = [(self.weekday - datetime.utcnow()).seconds, self.interval]  # type: Union[list, int]
        else:
            interval = self.interval
        job = TimeScheduledJob(interval, job_time, run_once=self.run_once)
        job.continue_running = self.continue_running
        return job

    def do(self, func, args=None) -> BaseProcess:
        """
        If the job is scheduled to execute after a specific interval, this function returns a ScheduledJob process,
        which will ensure that takes place.

        :param func: The function to be pickled and passed to the subprocess to execute
        :param args: Any arguments to be passed to the picked function
        """
        if self.weekday is not None:
            # Set 2 intervals, where the first interval is the time from now until the first execution
            interval = [(self.weekday - datetime.utcnow()).seconds, self.interval]  # type: Union[list, int]
        else:
            interval = self.interval
        job = ScheduledJob(interval, run_once=self.run_once)
        job.continue_running = self.continue_running
        return job.do(func, args)


class Scheduler:
    """
    Scheduler class, provides a set of methods for scheduling when a job should occur. For example:
    Scheduler(interval=1, run_once=True).minute().do(job)

    :param interval: The interval of time to wait between job executions
    :param run_once: Whether the job should only be run once
    """

    def __init__(self, interval: int, run_once=False):
        self.interval = interval
        self._run_once = run_once

    def second(self) -> ScheduledJob:
        """
        Schedule a job to execute every second
        """
        return self.seconds()

    def seconds(self) -> ScheduledJob:
        """
        Schedule a job to execute every x seconds
        """
        return ScheduledJob(interval=self.interval, run_once=self._run_once)

    def minute(self) -> ScheduledJob:
        """
        Schedule a job to execute every minute
        """
        return self.minutes()

    def minutes(self) -> ScheduledJob:
        """
        Schedule a job to execute every x minutes
        """
        return ScheduledJob(interval=self.interval * 60, run_once=self._run_once)

    def hour(self) -> ScheduledJob:
        """
        Schedule a job to execute every hour
        """
        return self.hours()

    def hours(self) -> ScheduledJob:
        """
        Schedule a job to execute every x hours
        """
        return ScheduledJob(interval=self.interval * 3600, run_once=self._run_once)

    def day(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every day
        """
        return self.days()

    def days(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every x days
        """
        return ScheduledJobFactory(interval=self.interval * 86400, run_once=self._run_once)

    def _weekday(self, weekday: int):
        # The job must execute on a weekly interval
        return ScheduledJobFactory(
            interval=self.interval * 604800,
            run_once=self._run_once,
            weekday=str(weekday),  # type: ignore
        )

    def monday(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every Monday
        """
        return self._weekday(1)

    def tuesday(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every Tuesday
        """
        return self._weekday(2)

    def wednesday(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every Wednesday
        """
        return self._weekday(3)

    def thursday(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every Thursday
        """
        return self._weekday(4)

    def friday(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every Friday
        """
        return self._weekday(5)

    def saturday(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every Saturday
        """
        return self._weekday(6)

    def sunday(self) -> ScheduledJobFactory:
        """
        Schedule a job to execute every Sunday
        """
        return self._weekday(0)


def every(interval: int = 1) -> Scheduler:
    """
    Schedule a job to occur every x units of time. For example, scheduler.every().day().at(10:10).do(job).

    :param interval: An integer denoting the amount of time to wait between repeat executions of the job.
    """
    return Scheduler(interval)


def on(interval: int = 1) -> Scheduler:
    """
    Schedule a job to occur once only after x units of time. For example, scheduler.on(1).day().at(10:10).do(job).

    :param interval: An integer denoting the amount of time to wait between repeat executions of the job.
    """
    return Scheduler(interval, run_once=True)


def cron(crondef: str) -> CronScheduledJob:
    """
    Schedule a job to occur based on a cron schedule expression. For example scheduler.cron("0 0 * * *").do(job).

    :param crondef: The cron schedule expression.
    """
    return CronScheduledJob(crondef)
