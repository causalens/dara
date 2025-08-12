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

from __future__ import annotations

import os
import sys

from dara.core.logging import dev_logger, eng_logger

CGROUP_V2_INDICATOR_PATH = '/sys/fs/cgroup/cgroup.controllers'  # Used to determine whether we're using cgroupv2

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
    if sys.platform == 'win32':
        dev_logger.warning('Memory limit is not supported on Windows platforms')
        return

    import resource

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
