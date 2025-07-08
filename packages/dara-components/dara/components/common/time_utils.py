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

import datetime
from typing import Union

import numpy

UTC = datetime.timezone.utc


def datetime_to_timemilli(d: datetime.datetime) -> float:
    """Convert datetime to timemilli."""
    if d.tzinfo is None:
        d = d.replace(tzinfo=UTC)
    elif d.tzinfo != UTC:
        raise ValueError('All datetimes must be UTC or naive (assumed UTC).')
    return d.timestamp() * 1000.0


def date_to_datetime(d: datetime.date, hh=23, mm=59, ss=59) -> datetime.datetime:
    """Convert date to datetime."""
    return datetime.datetime(d.year, d.month, d.day, hh, mm, ss)


def coerce_to_timemilli(t: Union[int, float, datetime.date, datetime.datetime]) -> float:
    """Convert any of int/float/date/datetime into a timemilli."""
    if isinstance(t, (int, numpy.signedinteger, float, numpy.floating)):
        return float(t)
    # The order matters - datetime.datetime is a subclass of the datetime.date
    elif isinstance(t, datetime.datetime):
        return datetime_to_timemilli(t)
    elif isinstance(t, datetime.date):
        return datetime_to_timemilli(date_to_datetime(t))
    else:
        raise ValueError(f'Invalid timemilli: {t!r} (of type {type(t)!r})')
