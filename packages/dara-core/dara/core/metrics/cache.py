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

from typing import Dict, Union

from prometheus_client import Info

from dara.core.base_definitions import DaraBaseModel as BaseModel

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

    return f'{num:.2f} {unit}'  # type: ignore


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
