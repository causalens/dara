"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from itertools import chain
from sys import getsizeof

from pydantic import BaseModel

from dara.core.logging import dev_logger


def dict_handler(d):
    return chain.from_iterable(d.items())


def pydantic_handler(m):
    return m.__dict__


def total_size(o: object):
    """
    Taken from example recommended by official Python docs.

    Returns the approximate memory footprint an object and all of its contents.

    Automatically finds the contents of the following builtin containers and
    their subclasses:  tuple, list, deque, dict, set and frozenset.
    To search other containers, add handlers to iterate over their contents:

        handlers = {SomeContainerClass: iter,
                    OtherContainerClass: OtherContainerClass.get_elements}

    """
    if o is None:
        return 0

    try:
        all_handlers = {tuple: iter, list: iter, dict: dict_handler, set: iter, BaseModel: pydantic_handler}
        seen = set()                      # track which object id's have already been seen
        default_size = getsizeof(0)       # estimate sizeof object without __sizeof__

        def sizeof(o):
            if id(o) in seen:       # do not double count the same object
                return 0
            seen.add(id(o))
            s = getsizeof(o, default_size)

            for typ, handler in all_handlers.items():
                if isinstance(o, typ):
                    s += sum(map(sizeof, handler(o)))
                    break
            return s

        return sizeof(o)
    except Exception as e:
        dev_logger.warning('Failed to count object size', {'object': o, 'exception': e})
        return 0
