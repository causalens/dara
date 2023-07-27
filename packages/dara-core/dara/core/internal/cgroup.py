"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from __future__ import annotations

import os
import resource

from dara.core.logging import eng_logger

CGROUP_V2_INDICATOR_PATH = '/sys/fs/cgroup/cgroup.controllers'   # Used to determine whether we're using cgroupv2

CGROUP_V1_MEM_PATH = '/sys/fs/cgroup/memory/memory.limit_in_bytes'
CGROUP_V2_MEM_PATH = '/sys/fs/cgroup/memory.max'

CGROUP_V1_CPU_QUOTA_PATH = '/sys/fs/cgroup/cpu/cpu.cfs_quota_us'
CGROUP_V1_CPU_PERIOD_PATH = '/sys/fs/cgroup/cpu/cpu.cfs_period_us'
CGROUP_V2_CPU_PATH = '/sys/fs/cgroup/cpu.max'


def set_memory_limit():
    """
    Set memory limit for Python to limits defined in the cgroup.
    Works with both cgroupv1 and cgroupv2.
    """
    # Get current limits
    soft, hard = resource.getrlimit(resource.RLIMIT_AS)

    path = CGROUP_V1_MEM_PATH

    # Use cgroupv2 if it's available
    if os.path.isfile(CGROUP_V2_INDICATOR_PATH):
        path = CGROUP_V2_MEM_PATH

    if os.path.isfile(path):
        eng_logger.debug(f'Found cgroup memory limit configuration at "{path}"')
        with open(path, encoding='utf-8') as limit:
            try:
                new_limit = int(limit.read())
                soft = new_limit
                hard = new_limit
            except BaseException:
                # Failed to read the limit (i.e. limit was a string 'max'), don't set it
                pass

    eng_logger.debug(f'Setting memory limit to {soft}')
    resource.setrlimit(resource.RLIMIT_AS, (soft, hard))


def get_cpu_count():
    """
    Get current CPU count.

    Attempts to read from cgroup configuration, falls back to os.cpu_count()
    """
    cpu_quota = -1

    # If cgroupv2 is available
    if os.path.isfile(CGROUP_V2_INDICATOR_PATH):
        try:
            with open(CGROUP_V2_CPU_PATH, encoding='utf-8') as f:
                cfs_quota_us, cfs_period_us = [int(v) for v in f.read().strip().split()]
                cpu_quota = cfs_quota_us // cfs_period_us
        except BaseException:
            pass
    else:
        # Try cgroup v1
        try:
            with open(CGROUP_V1_CPU_QUOTA_PATH, encoding='utf-8') as f:
                cfs_quota_us = int(f.read())
            with open(CGROUP_V1_CPU_PERIOD_PATH, encoding='utf-8') as f:
                cfs_period_us = int(f.read())

            cpu_quota = cfs_quota_us // cfs_period_us
        except BaseException:
            pass

    if cpu_quota >= 0:
        return cpu_quota

    # Fall back to cpu_count if not able to be read
    return os.cpu_count() or 1
