"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Dict, Union

from prometheus_client import Info
from pydantic import BaseModel

cache_metric = Info('cache_size', 'Current size of cache stores and registries', labelnames=['registry_name'])


def format_bytes(num: Union[int, float]) -> str:
    """
    Efficient way to format bytes to human readable,
    simplified version of https://stackoverflow.com/a/63839503
    """
    precision_offset = 0.005
    unit_labels = ['B', 'kB', 'MB', 'GB']
    last_label = unit_labels[-1]
    unit_step = 1000
    unit_step_thresh = unit_step - precision_offset

    for unit in unit_labels:
        if num < unit_step_thresh:
            # Only accepts the CURRENT unit if we're BELOW the threshold where
            # float rounding behavior would place us into the NEXT unit: F.ex.
            # when rounding a float to 1 decimal, any number ">= 1023.95" will
            # be rounded to "1024.0". Obviously we don't want ugly output such
            # as "1024.0 KiB", since the proper term for that is "1.0 MiB".
            break
        if unit != last_label:
            # We only shrink the number if we HAVEN'T reached the last unit.
            num /= unit_step

    return f'{num:.2f} {unit}'


class CacheMetricsTracker(BaseModel):
    """
    Stores and aggregates cache sizes for metrics
    """

    registries: Dict[str, int] = {}
    cache_store: int = 0

    def update_registry(self, name: str, size: int):
        cache_metric.labels(f'{name} Registry').info({'size': format_bytes(size)})
        self.registries[name] = size
        self._update_total()

    def update_store(self, size: int):
        cache_metric.labels('Cache Store').info({'size': format_bytes(size)})
        self.cache_store = size
        self._update_total()

    def _update_total(self):
        total = sum(self.registries.values()) + self.cache_store
        total = format_bytes(total)
        cache_metric.labels('Total').info({'size': total})


CACHE_METRICS_TRACKER = CacheMetricsTracker()
