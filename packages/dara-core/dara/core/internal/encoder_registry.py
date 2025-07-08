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

from collections.abc import MutableMapping
from inspect import Parameter, isclass
from typing import (
    Any,
    Callable,
    Dict,
    Optional,
    Type,
    Union,
    get_args,
    get_origin,
)

import numpy
import pandas
from fastapi.encoders import jsonable_encoder
from pandas.core.arrays.base import ExtensionArray
from pydantic import BaseModel
from typing_extensions import TypedDict

from dara.core.base_definitions import BaseTask


class Encoder(TypedDict):
    serialize: Callable
    deserialize: Callable


def _not_implemented(x, dtype):
    raise NotImplementedError(f'No deserialization implementation for item {x} of dtype {dtype}')


def _get_numpy_dtypes_encoder(typ: Type[Any]):
    """
    Construct numpy generic datatype

    :param typ: The numpy generic datatype class
    """
    return Encoder(serialize=lambda x: x.item(), deserialize=lambda x: typ(x))


def _get_numpy_str_encoder(typ: Type[Any]):
    """
    Construct numpy str datatype

    :param typ: The numpy datatype class
    """
    return Encoder(serialize=lambda x: str(x), deserialize=lambda x: typ(x))


def _get_pandas_array_encoder(array_type: Type[Any], dtype: Any, raise_: bool = False):
    return Encoder(
        serialize=lambda x: x.astype(str).tolist(),
        deserialize=lambda x: pandas.array(x, dtype=dtype) if not raise_ else _not_implemented(x, dtype),
    )


def _tuple_key_serialize(d):
    """
    A helper function to recursively check if a dict have a tuple key type and turn it into a string with "__tuple__" prefix.
    The reason for this is jsonable_encoder will turn tuple into list, but list is not hashable.
    Hence we serialize tuple key by our side.

    :param d: the dict where tuple key to be serialized
    """
    encoded_dict = {}
    for key, value in d.items():
        encoded_key = '__tuple__' + str(key) if isinstance(key, tuple) else key
        encoded_value = _tuple_key_serialize(value) if isinstance(value, dict) else value
        encoded_dict[encoded_key] = encoded_value
    return encoded_dict


def _tuple_key_deserialize(d):
    """
    A helper function to recursively check if a dict have a key with "__tuple__" prefix and turn it back to tuple

    :param d: the dict where tuple key to be deserialized
    """
    encoded_dict = {}
    for key, value in d.items():
        if isinstance(key, str) and key.startswith('__tuple__'):
            key_list = []
            for each in key[10:-1].split(', '):
                if (each.startswith("'") and each.endswith("'")) or (each.startswith('"') and each.endswith('"')):
                    key_list.append(each[1:-1])
                else:
                    key_list.append(each)
            encoded_key = tuple(key_list)
        else:
            encoded_key = key

        encoded_value = _tuple_key_deserialize(value) if isinstance(value, dict) else value
        encoded_dict[encoded_key] = encoded_value
    return encoded_dict


def _df_deserialize(x):
    """
    A function to deserialize data into a DataFrame

    :param x: the value to be deserialized to a DataFrame
    """

    if isinstance(x, pandas.DataFrame):
        return x
    if isinstance(x, dict):
        return pandas.DataFrame(_tuple_key_deserialize(x))
    _not_implemented(x, pandas.DataFrame)


# A encoder_registry to handle serialization/deserialization for numpy/pandas type
encoder_registry: MutableMapping[Type[Any], Encoder] = {
    int: Encoder(serialize=lambda x: x, deserialize=lambda x: int(x)),
    float: Encoder(serialize=lambda x: x, deserialize=lambda x: float(x)),
    str: Encoder(serialize=lambda x: x, deserialize=lambda x: str(x)),
    numpy.ndarray: Encoder(serialize=lambda x: x.tolist(), deserialize=lambda x: numpy.array(x)),
    numpy.int8: _get_numpy_dtypes_encoder(numpy.int8),
    numpy.int16: _get_numpy_dtypes_encoder(numpy.int16),
    numpy.int32: _get_numpy_dtypes_encoder(numpy.int32),
    numpy.int64: _get_numpy_dtypes_encoder(numpy.int64),
    numpy.longlong: _get_numpy_dtypes_encoder(numpy.longlong),
    numpy.timedelta64: Encoder(
        serialize=lambda x: x.astype('timedelta64[ns]').item(), deserialize=lambda x: numpy.timedelta64(int(x), 'ns')
    ),
    numpy.uint8: _get_numpy_dtypes_encoder(numpy.uint8),
    numpy.uint16: _get_numpy_dtypes_encoder(numpy.uint16),
    numpy.uint32: _get_numpy_dtypes_encoder(numpy.uint32),
    numpy.uint64: _get_numpy_dtypes_encoder(numpy.uint64),
    numpy.ulonglong: _get_numpy_dtypes_encoder(numpy.ulonglong),
    numpy.float16: _get_numpy_dtypes_encoder(numpy.float16),
    numpy.float32: _get_numpy_dtypes_encoder(numpy.float32),
    numpy.float64: _get_numpy_dtypes_encoder(numpy.float64),
    numpy.longdouble: _get_numpy_str_encoder(numpy.longdouble),
    numpy.complex64: _get_numpy_str_encoder(numpy.complex64),
    numpy.complex128: _get_numpy_str_encoder(numpy.complex128),
    numpy.clongdouble: _get_numpy_str_encoder(numpy.clongdouble),
    numpy.bytes_: Encoder(serialize=lambda x: x.decode('utf-8'), deserialize=lambda x: numpy.bytes_(x)),
    numpy.str_: _get_numpy_dtypes_encoder(numpy.str_),
    numpy.void: Encoder(serialize=lambda x: x.tobytes().decode(), deserialize=lambda x: numpy.void(x.encode())),
    numpy.bool_: _get_numpy_dtypes_encoder(numpy.bool_),
    numpy.datetime64: Encoder(serialize=lambda x: x.item().isoformat(), deserialize=lambda x: numpy.datetime64(x)),
    type(numpy.dtype('int8')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('int16')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('int32')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('int64')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('timedelta64')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('uint8')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('uint16')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('uint32')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('uint64')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('float16')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('float32')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('float64')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('complex64')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('complex128')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('bool_')): _get_numpy_str_encoder(numpy.dtype),
    # bytes_/str_/void belongs to dtype('O')
    type(numpy.dtype('O')): _get_numpy_str_encoder(numpy.dtype),
    type(numpy.dtype('datetime64')): _get_numpy_str_encoder(numpy.dtype),
    ExtensionArray: Encoder(serialize=lambda x: x.tolist(), deserialize=lambda x: pandas.array(x)),
    pandas.arrays.IntervalArray: _get_pandas_array_encoder(pandas.arrays.IntervalArray, pandas.Interval, True),
    pandas.arrays.PeriodArray: _get_pandas_array_encoder(pandas.arrays.PeriodArray, pandas.Period, True),
    pandas.arrays.DatetimeArray: _get_pandas_array_encoder(pandas.arrays.DatetimeArray, numpy.dtype('datetime64[ns]')),
    pandas.arrays.IntegerArray: _get_pandas_array_encoder(pandas.arrays.IntegerArray, numpy.dtype('int')),
    pandas.arrays.FloatingArray: _get_pandas_array_encoder(pandas.arrays.FloatingArray, numpy.dtype('float')),
    pandas.arrays.StringArray: _get_pandas_array_encoder(pandas.arrays.StringArray, str),
    pandas.arrays.BooleanArray: Encoder(
        serialize=lambda x: x.tolist(), deserialize=lambda x: pandas.array(x, dtype='boolean')
    ),
    pandas.Series: Encoder(serialize=lambda x: x.to_list(), deserialize=lambda x: pandas.Series(x)),
    pandas.Index: Encoder(serialize=lambda x: x.to_list(), deserialize=lambda x: pandas.Index(x)),
    pandas.Timestamp: Encoder(serialize=lambda x: x.isoformat(), deserialize=lambda x: pandas.Timestamp(x)),
    pandas.DataFrame: Encoder(
        serialize=lambda x: jsonable_encoder(_tuple_key_serialize(x.to_dict(orient='dict'))),
        deserialize=lambda x: _df_deserialize(x),
    ),
}

try:
    # technically you can use dara core without this package
    from cai_causal_graph import CausalGraph, Skeleton
    from cai_causal_graph.graph_components import Node
except ImportError:
    # If the import fails, we don't need to register the encoders for these types
    pass
else:
    encoder_registry.update(
        {
            CausalGraph: Encoder(serialize=lambda x: x.to_dict(), deserialize=lambda x: CausalGraph.from_dict(x)),
            Skeleton: Encoder(serialize=lambda x: x.to_dict(), deserialize=lambda x: Skeleton.from_dict(x)),
            Node: Encoder(serialize=lambda x: x.to_dict(), deserialize=lambda x: Node.from_dict(x)),
        }
    )


def get_jsonable_encoder() -> Dict[Type[Any], Callable[..., Any]]:
    """
    Get the encoder registry as a dict of `{type: serialize}` pairs
    """
    return {k: v['serialize'] for k, v in encoder_registry.items()}


def deserialize(value: Any, typ: Optional[Type]):
    """
    Deserialize a value into a given type.

    Looks up the type in the encoder_registry and uses the deserializer to convert the value into the given type.

    :param value: the value to deserialize
    :param typ: the type to deserialize into
    """
    # This funtion is commonly used to deserialize parameters, which can be Parameter.empty rather than None
    if typ == Parameter.empty:
        return value

    # Tasks cannot be deserialized
    if isinstance(value, BaseTask):
        return value

    # No annotation provided or none value
    if typ is None or value is None:
        return value

    # Already matches type
    if type(value) is typ:
        return value

    # Handle Optional[foo] / Union[foo, None] -> call deserialize(value, foo)
    if get_origin(typ) == Union:
        args = get_args(typ)
        if len(args) == 2 and type(None) in args:
            not_none_arg = args[0] if args[0] is not type(None) else args[1]
            return deserialize(value, not_none_arg)

    try:
        # Explicit encoder found
        if typ in encoder_registry:
            return encoder_registry[typ]['deserialize'](value)

        # Generic handling for pydantic models
        if isclass(typ) and issubclass(typ, BaseModel) and value is not None:
            return typ(**value)
    except Exception as e:
        raise ValueError(
            f'Failed to deserialize value "{value}" into expected type "{typ}". Consider defining a custom deserializer for the type using the `config.add_encoder` API or removing the type annotation and handling the raw value manually'
        ) from e

    # Fall back to returning the value
    return value
