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
from typing import Any, Callable, MutableMapping, Type

import numpy
import pandas
from typing_extensions import TypedDict


class Encoder(TypedDict):
    serialize: Callable
    deserialize: Callable


def _get_numpy_dtypes_encoder(typ: Type[Any]):
    """
    Construct numpy generic datatype

    :param typ: The numpy generic datatype class
    """
    return Encoder(serialize=lambda x: x.item(), deserialize=lambda x: typ(x))


# A encoder_registry to handle serialization/deserialization for numpy/pandas type
encoder_registry: MutableMapping[Type[Any], Encoder] = {
    numpy.ndarray: Encoder(serialize=lambda x: x.tolist(), deserialize=lambda x: numpy.array(x)),
    numpy.int8: _get_numpy_dtypes_encoder(numpy.int8),
    numpy.int16: _get_numpy_dtypes_encoder(numpy.int16),
    numpy.int32: _get_numpy_dtypes_encoder(numpy.int32),
    numpy.int64: _get_numpy_dtypes_encoder(numpy.int64),
    numpy.longlong: _get_numpy_dtypes_encoder(numpy.longlong),
    numpy.timedelta64: _get_numpy_dtypes_encoder(numpy.timedelta64),
    numpy.uint8: _get_numpy_dtypes_encoder(numpy.uint8),
    numpy.uint16: _get_numpy_dtypes_encoder(numpy.uint16),
    numpy.uint32: _get_numpy_dtypes_encoder(numpy.uint32),
    numpy.uint64: _get_numpy_dtypes_encoder(numpy.uint64),
    numpy.ulonglong: _get_numpy_dtypes_encoder(numpy.ulonglong),
    numpy.float16: _get_numpy_dtypes_encoder(numpy.float16),
    numpy.float32: _get_numpy_dtypes_encoder(numpy.float32),
    numpy.float64: _get_numpy_dtypes_encoder(numpy.float64),
    numpy.longdouble: _get_numpy_dtypes_encoder(numpy.longdouble),
    numpy.complex64: _get_numpy_dtypes_encoder(numpy.complex64),
    numpy.complex128: _get_numpy_dtypes_encoder(numpy.complex128),
    numpy.clongdouble: _get_numpy_dtypes_encoder(numpy.clongdouble),
    numpy.bytes_: _get_numpy_dtypes_encoder(numpy.bytes_),
    numpy.str_: _get_numpy_dtypes_encoder(numpy.str_),
    numpy.void: _get_numpy_dtypes_encoder(numpy.void),
    numpy.record: _get_numpy_dtypes_encoder(numpy.record),
    numpy.bool_: _get_numpy_dtypes_encoder(numpy.bool_),
    numpy.datetime64: _get_numpy_dtypes_encoder(numpy.datetime64),
    pandas.array: Encoder(serialize=lambda x: x.tolist(), deserialize=lambda x: pandas.array(x)),
    pandas.Series: Encoder(serialize=lambda x: x.to_list(), deserialize=lambda x: pandas.Series(x)),
    pandas.Index: Encoder(serialize=lambda x: x.to_list(), deserialize=lambda x: pandas.Index(x)),
    pandas.Timestamp: Encoder(serialize=lambda x: x.date(), deserialize=lambda x: pandas.Timestamp(x)),
}
