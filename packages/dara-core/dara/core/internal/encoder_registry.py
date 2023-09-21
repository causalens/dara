from typing import Any, MutableMapping, TypedDict,Type,Callable
import pandas
import numpy


class Encoder(TypedDict):
    serialize: Callable
    deserialize:Callable


def get_numpy_dtypes_encoder(typ:Type[Any]):
    return Encoder(serialize=lambda x:x.item(),deserialize=lambda x:typ(x))

encoder_registry: MutableMapping[Type[Any], Encoder] = {
    numpy.ndarray: Encoder(serialize=lambda x:x.tolist(),deserialize=lambda x:numpy.array(x)),

    numpy.int8:get_numpy_dtypes_encoder(numpy.int8),
    numpy.int16:get_numpy_dtypes_encoder(numpy.int16),
    numpy.int32:get_numpy_dtypes_encoder(numpy.int32),
    numpy.int64:get_numpy_dtypes_encoder(numpy.int64),
    numpy.longlong:get_numpy_dtypes_encoder(numpy.longlong),
    numpy.timedelta64:get_numpy_dtypes_encoder(numpy.timedelta64),

    numpy.uint8:get_numpy_dtypes_encoder(numpy.uint8),
    numpy.uint16:get_numpy_dtypes_encoder(numpy.uint16),
    numpy.uint32:get_numpy_dtypes_encoder(numpy.uint32),
    numpy.uint64:get_numpy_dtypes_encoder(numpy.uint64),
    numpy.ulonglong:get_numpy_dtypes_encoder(numpy.ulonglong),

    numpy.float16:get_numpy_dtypes_encoder(numpy.float16),
    numpy.float32:get_numpy_dtypes_encoder(numpy.float32),
    numpy.float64:get_numpy_dtypes_encoder(numpy.float64),
    numpy.longdouble:get_numpy_dtypes_encoder(numpy.longdouble),

    numpy.complex64:get_numpy_dtypes_encoder(numpy.complex64),
    numpy.complex128:get_numpy_dtypes_encoder(numpy.complex128),
    numpy.clongdouble:get_numpy_dtypes_encoder(numpy.clongdouble),

    numpy.bytes_:get_numpy_dtypes_encoder(numpy.bytes_),
    numpy.str_:get_numpy_dtypes_encoder(numpy.str_),

    numpy.void:get_numpy_dtypes_encoder(numpy.void),
    numpy.record:get_numpy_dtypes_encoder(numpy.record),

    numpy.bool_:get_numpy_dtypes_encoder(numpy.bool_),
    numpy.datetime64:get_numpy_dtypes_encoder(numpy.datetime64),

    pandas.array: Encoder(serialize=lambda x:x.tolist(),deserialize=lambda x:pandas.array(x)),
    pandas.Series: Encoder(serialize=lambda x:x.to_list(),deserialize=lambda x:pandas.Series(x)),
    pandas.Index: Encoder(serialize=lambda x:x.to_list(),deserialize=lambda x:pandas.Index(x)),
    pandas.Timestamp: Encoder(serialize=lambda x:x.date(),deserialize=lambda x:pandas.Timestamp(x)),



}
