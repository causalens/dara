"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import (
    Any,
    Generic,
    List,
    Mapping,
    Tuple,
    TypedDict,
    TypeVar,
    Union,
    cast,
    overload,
)

from pydantic import BaseModel
from typing_extensions import TypeGuard

from dara.core.internal.hashing import hash_object

JsonLike = Union[Mapping, List]

DataType = TypeVar('DataType')


class NormalizedPayload(BaseModel, Generic[DataType]):
    data: DataType
    lookup: Mapping


class Placeholder(TypedDict):
    """
    Placeholder object 'Referrable' objects are replaced with
    """

    __ref: str   # pylint: disable=unused-private-member


class Referrable(TypedDict):
    """
    Describes an object which can be replaced by a Placeholder.
    """

    __typename: str   # pylint: disable=unused-private-member
    uid: str


class ReferrableWithNested(Referrable):
    nested: List[str]


class ReferrableWithFilters(Referrable):
    filters: dict


def _has_template_marker(obj: Any) -> bool:
    """
    Check if an object has a TemplateMarker
    anywhere in its data
    """
    if isinstance(obj, dict):
        if obj.get('__typename') == 'TemplateMarker':
            return True

        for val in obj.values():
            if _has_template_marker(val):
                return True

    if isinstance(obj, list):
        for item in obj:
            if _has_template_marker(item):
                return True

    return False


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

    if _is_referrable_with_filters(obj):
        filter_hash = hash_object(obj['filters'])
        identifier = f'{identifier}:{filter_hash}'

    return identifier


def _is_referrable(obj: Any) -> TypeGuard[Referrable]:
    """
    Check if a dict is a Referrable type with a '__typename' field and 'uid'

    Bails out if the object has a TemplateMarker
    """
    return isinstance(obj, dict) and '__typename' in obj and 'uid' in obj and not _has_template_marker(obj)


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
def normalize(obj: Mapping, check_root: bool = True) -> Tuple[Mapping, Mapping]:
    ...


@overload
def normalize(obj: List, check_root: bool = True) -> Tuple[List, Mapping]:
    ...


def normalize(obj: JsonLike, check_root: bool = True) -> Tuple[JsonLike, Mapping]:
    """
    Normalize a dictionary - extract referrable data into a separate lookup dictionary, replacing instances
    found with placeholders.

    :param obj: object to normalize
    :param check_root: whether to check if the root object is also a referrable object
    """
    lookup = {}
    output: Union[Mapping[Any, Any], List[Any]] = {} if isinstance(obj, dict) else [None for x in range(len(obj))]

    # The whole object is referrable
    if check_root and _is_referrable(obj):
        identifier = _get_identifier(obj)
        # Don't check root again otherwise we end up in an infinite loop, we know it's referrable
        _normalized, _lookup = normalize(obj, False)
        lookup[identifier] = _normalized
        lookup.update(_lookup)
        output = Placeholder(__ref=identifier)
    else:
        for key, value in _loop(obj):
            # For iterables, recursively call normalize
            if isinstance(value, (dict, list)):
                _normalized, _lookup = normalize(value)   # type: ignore
                output[key] = _normalized  # type: ignore
                lookup.update(_lookup)
            else:
                # Other non-list, non-dict types just pass through
                output[key] = value  # type: ignore

    return output, lookup


@overload
def denormalize(normalized_obj: Mapping, lookup: Mapping) -> Mapping:
    ...


@overload
def denormalize(normalized_obj: List, lookup: Mapping) -> List:
    ...


def denormalize(normalized_obj: JsonLike, lookup: Mapping) -> JsonLike:
    """
    Denormalize data by replacing Placeholders found with objects from the lookup

    :normalized_obj: object or list containing placeholders
    :lookup: dict mapping identifiers to referrables
    """
    output: Union[Mapping[Any, Any], List[Any]] = (
        {} if isinstance(normalized_obj, dict) else [None for x in range(len(normalized_obj))]
    )

    # Whole object is a placeholder
    if _is_placeholder(normalized_obj):
        ref = normalized_obj['__ref']
        referrable = lookup[ref] if ref in lookup else None

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
