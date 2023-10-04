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
# pylint: disable=unnecessary-lambda
from typing import Any, Callable, MutableMapping, Optional, Type

import numpy
import pandas
from pandas.core.arrays.base import ExtensionArray
from typing_extensions import TypedDict


class Encoder(TypedDict):
    serialize: Callable
    deserialize: Callable

def _not_implemented(x):
    raise NotImplementedError(f'No deserialization implementation for item {x}')

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

def _get_pandas_array_encoder(array_type: Type[Any], dtype: Optional[Type[Any]]):
    return Encoder(
        serialize=lambda x: x.astype(str).tolist(),
        deserialize=lambda x: pandas.array(x, dtype=dtype) if dtype else _not_implemented(x)
    )

# A encoder_registry to handle serialization/deserialization for numpy/pandas type
encoder_registry: MutableMapping[Type[Any], Encoder] = {
    numpy.ndarray: Encoder(serialize=lambda x: x.tolist(), deserialize=lambda x: numpy.array(x)),
    numpy.int8: _get_numpy_dtypes_encoder(numpy.int8),
    numpy.int16: _get_numpy_dtypes_encoder(numpy.int16),
    numpy.int32: _get_numpy_dtypes_encoder(numpy.int32),
    numpy.int64: _get_numpy_dtypes_encoder(numpy.int64),
    numpy.longlong: _get_numpy_dtypes_encoder(numpy.longlong),
    numpy.timedelta64:  Encoder(serialize=lambda x: x.astype('timedelta64[ns]').item(), deserialize=lambda x: numpy.timedelta64(int(x), 'ns')),
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
    ExtensionArray: Encoder(serialize=lambda x: x.tolist(), deserialize=lambda x: pandas.array(x)),
    pandas.arrays.IntervalArray: _get_pandas_array_encoder(pandas.arrays.IntervalArray, pandas.Interval),
    pandas.arrays.PeriodArray: _get_pandas_array_encoder(pandas.arrays.PeriodArray, None),
    pandas.arrays.DatetimeArray: _get_pandas_array_encoder(pandas.arrays.DatetimeArray, numpy.dtype('datetime64[ns]')),
    pandas.arrays.IntegerArray: _get_pandas_array_encoder(pandas.arrays.IntegerArray, numpy.dtype('int')),
    pandas.arrays.FloatingArray: _get_pandas_array_encoder(pandas.arrays.FloatingArray, numpy.dtype('float')),
    pandas.arrays.StringArray: _get_pandas_array_encoder(pandas.arrays.StringArray, str),
    pandas.arrays.BooleanArray: _get_pandas_array_encoder(pandas.arrays.BooleanArray, numpy.dtype('bool')),
    pandas.Series: Encoder(serialize=lambda x: x.to_list(), deserialize=lambda x: pandas.Series(x)),
    pandas.Index: Encoder(serialize=lambda x: x.to_list(), deserialize=lambda x: pandas.Index(x)),
    pandas.Timestamp: Encoder(serialize=lambda x: x.isoformat(), deserialize=lambda x: pandas.Timestamp(x)),
}
