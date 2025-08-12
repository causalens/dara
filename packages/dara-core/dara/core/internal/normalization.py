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

from collections.abc import Mapping
from typing import (
    Any,
    Generic,
    List,
    Optional,
    Tuple,
    TypeVar,
    Union,
    cast,
    overload,
)

from typing_extensions import TypedDict, TypeGuard

from dara.core.base_definitions import DaraBaseModel as BaseModel

JsonLike = Union[Mapping, List]

DataType = TypeVar('DataType')


class NormalizedPayload(BaseModel, Generic[DataType]):
    data: DataType
    lookup: Mapping


class Placeholder(TypedDict):
    """
    Placeholder object 'Referrable' objects are replaced with
    """

    __ref: str


class Referrable(TypedDict):
    """
    Describes an object which can be replaced by a Placeholder.
    """

    __typename: str
    uid: str


class ReferrableWithNested(Referrable):
    nested: List[str]


class ReferrableWithFilters(Referrable):
    filters: dict


def _get_identifier(obj: Referrable) -> str:
    """
    Get a unique identifier from a 'referrable' object
    """
    uid = str(obj['uid'])
    typename = str(obj['__typename'])
    identifier = f'{typename}:{uid}'

    # If it's a Variable with 'nested', the property should be included in the identifier
    if _is_referrable_nested(obj) and len(obj['nested']) > 0:
        nested = ','.join(cast(List[str], obj['nested']))
        identifier = f'{identifier}:{nested}'

    return identifier


def _is_referrable(obj: Any) -> TypeGuard[Referrable]:
    """
    Check if a dict is a Referrable type with a '__typename' field and 'uid'
    """
    return (
        isinstance(obj, dict)
        and '__typename' in obj
        and 'Variable' in obj['__typename']  # Right now this is meant for Variable objects only
        and 'uid' in obj
    )


def _is_referrable_nested(obj: Referrable) -> TypeGuard[ReferrableWithNested]:
    """
    Check if a Referrable is a ReferrableWithNested
    """
    return 'nested' in obj


def _is_referrable_with_filters(obj: Referrable) -> TypeGuard[ReferrableWithFilters]:
    """
    Check if a Referrable is a ReferrableWithFilters
    """
    return 'filters' in obj


def _is_placeholder(obj: Any) -> TypeGuard[Placeholder]:
    """
    Check if a dict is a Placeholder type
    """
    return isinstance(obj, dict) and '__ref' in obj


def _loop(iterable: JsonLike):
    """
    Turn a list or object into a common iterable - set of (key, val) tuples.
    This way dicts and lists can be iterated over the same way
    """
    if isinstance(iterable, dict):
        return iterable.items()
    else:
        return enumerate(iterable)


@overload
def normalize(obj: Mapping, check_root: bool = True) -> Tuple[Mapping, Mapping]: ...


@overload
def normalize(obj: List, check_root: bool = True) -> Tuple[List, Mapping]: ...


def normalize(obj: JsonLike, check_root: bool = True) -> Tuple[JsonLike, Mapping]:
    """
    Normalize a dictionary - extract referrable data into a separate lookup dictionary, replacing instances
    found with placeholders.

    :param obj: object to normalize
    :param check_root: whether to check if the root object is also a referrable object
    """
    lookup: dict = {}

    if not isinstance(obj, (dict, list)):
        return obj, lookup

    output: Union[Mapping[Any, Any], List[Any]] = {} if isinstance(obj, dict) else [None for x in range(len(obj))]

    # The whole object is referrable
    if check_root and _is_referrable(obj):
        identifier = _get_identifier(obj)
        # Don't check root again otherwise we end up in an infinite loop, we know it's referrable
        _normalized, _lookup = normalize(obj, check_root=False)
        lookup[identifier] = _normalized
        lookup.update(_lookup)
        output = Placeholder(__ref=identifier)
    else:
        for key, value in _loop(obj):
            # For iterables, recursively call normalize
            if isinstance(value, (dict, list)):
                _normalized, _lookup = normalize(value)  # type: ignore
                output[key] = _normalized  # type: ignore
                lookup.update(_lookup)
            else:
                # Other non-list, non-dict types just pass through
                output[key] = value  # type: ignore

    return output, lookup


@overload
def denormalize(normalized_obj: Mapping, lookup: Mapping) -> Mapping: ...


@overload
def denormalize(normalized_obj: List, lookup: Mapping) -> List: ...


def denormalize(normalized_obj: JsonLike, lookup: Mapping) -> Optional[JsonLike]:
    """
    Denormalize data by replacing Placeholders found with objects from the lookup

    :normalized_obj: object or list containing placeholders
    :lookup: dict mapping identifiers to referrables
    """
    if normalized_obj is None:
        return None

    output: Union[Mapping[Any, Any], List[Any]] = (
        {} if isinstance(normalized_obj, dict) else [None for x in range(len(normalized_obj))]
    )

    # Whole object is a placeholder
    if _is_placeholder(normalized_obj):
        ref = normalized_obj['__ref']
        referrable = lookup.get(ref, None)

        if isinstance(referrable, (list, dict)):
            return denormalize(referrable, lookup)

        return referrable
    else:
        for key, value in _loop(normalized_obj):
            # Found some iterable
            if isinstance(value, (list, dict)):
                output[key] = denormalize(value, lookup)  # type: ignore
            else:
                # Other non-list, non-dict types just pass through
                output[key] = value  # type: ignore

    return output
