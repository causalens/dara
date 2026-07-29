"""Importable scheduled-job helpers used by subprocess tests."""

import json
import os
from pathlib import Path

from opentelemetry import trace


def record_telemetry_context(output_path: str) -> None:
    """
    Persist the trace and process identity visible inside a scheduled job.

    :param output_path: temporary file used to return data to the parent test
    """
    span = trace.get_current_span()
    span_context = span.get_span_context()
    parent = getattr(span, 'parent', None)
    provider = trace.get_tracer_provider()
    resource = getattr(provider, 'resource', None)
    resource_attributes = getattr(resource, 'attributes', {})
    Path(output_path).write_text(
        json.dumps(
            {
                'trace_id': format(span_context.trace_id, '032x'),
                'span_id': format(span_context.span_id, '016x'),
                'parent_span_id': format(parent.span_id, '016x') if parent is not None else None,
                'span_name': getattr(span, 'name', None),
                'process_pid': os.getpid(),
                'resource_process_pid': resource_attributes.get('process.pid'),
                'process_type': resource_attributes.get('dara.process.type'),
                'process_boot_id': resource_attributes.get('dara.process.boot.id'),
            }
        ),
        encoding='utf-8',
    )
