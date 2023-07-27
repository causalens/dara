"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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
    if isinstance(t, int) or isinstance(t, numpy.int_):
        return float(t)
    elif isinstance(t, float) or isinstance(t, numpy.float_):
        return float(t)
    # The order matters - datetime.datetime is a subclass of the datetime.date
    elif isinstance(t, datetime.datetime):
        return datetime_to_timemilli(t)
    elif isinstance(t, datetime.date):
        return datetime_to_timemilli(date_to_datetime(t))
    else:
        raise ValueError(f'Invalid timemilli: {t!r} (of type {type(t)!r})')
