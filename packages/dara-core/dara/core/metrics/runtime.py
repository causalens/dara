"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from prometheus_client import Histogram

BUCKETS = (
    0.05,
    0.1,
    0.25,
    0.5,
    1.0,
    2.0,
    3.0,
    4.0,
    5.0,
    10.0,
    15.0,
    20.0,
    25.0,
    30.0,
    60.0,  # 1 min
    90.0,
    120.0,  # 2 min
    180.0,  # 3 min
    240.0,  # 4 min
    300.0,  # 5 min
    600.0,  # 10 min
    float('inf'),
)


class RuntimeMetricsTracker:
    def __init__(self) -> None:
        self.task_histogram = Histogram('task_runtimes', 'Task Runtimes', labelnames=['task_name'], buckets=BUCKETS)
        self.dv_histogram = Histogram(
            'dv_runtimes', 'Derived Variable Runtimes', labelnames=['dv_name'], buckets=BUCKETS
        )

    def clean_name(self, name: str) -> str:
        return name.replace('-', '_').replace(' ', '_')

    def get_task_histogram(self, task_id: str) -> Histogram:
        """
        Get a histogram for a given task_id.
        """
        name = self.clean_name(task_id)
        return self.task_histogram.labels(name)

    def get_dv_histogram(self, dv_id: str) -> Histogram:
        """
        Get a histogram for a given derived variable id
        """
        name = self.clean_name(dv_id)
        return self.dv_histogram.labels(name)


RUNTIME_METRICS_TRACKER = RuntimeMetricsTracker()
