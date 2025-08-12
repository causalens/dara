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

from itertools import chain
from sys import getsizeof

from dara.core.base_definitions import DaraBaseModel as BaseModel
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

    ```
        handlers = {SomeContainerClass: iter,
                    OtherContainerClass: OtherContainerClass.get_elements}
    ```

    """
    if o is None:
        return 0

    try:
        all_handlers = {tuple: iter, list: iter, dict: dict_handler, set: iter, BaseModel: pydantic_handler}
        seen = set()  # track which object id's have already been seen
        default_size = getsizeof(0)  # estimate sizeof object without __sizeof__

        def sizeof(o):
            if id(o) in seen:  # do not double count the same object
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
