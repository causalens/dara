from inspect import Parameter
import json
from typing import Optional, Union
from dara.core.base_definitions import PendingTask
from dara.core.internal.tasks import Task

import numpy
import pandas
from pydantic import BaseModel
import pytest
from pandas.core.arrays.base import ExtensionArray

from dara.core.internal.encoder_registry import deserialize, encoder_registry

dates = pandas.date_range(start='2021-01-01', end='2021-01-02', freq='D')
timestamp = pandas.Timestamp('2023-10-04')
df_with_datetime_index = pandas.DataFrame({'col1': [1.0, numpy.nan], 'col2': [timestamp, timestamp]}, index=dates)

pytestmark = pytest.mark.anyio

@pytest.mark.parametrize(
    'type_, value, raise_',
    [
        (numpy.ndarray, numpy.array([1, 2, 3]), False),
        (numpy.int8, numpy.int8(1), False),
        (numpy.int16, numpy.int16(1), False),
        (numpy.int32, numpy.int32(1), False),
        (numpy.int64, numpy.int64(1), False),
        (numpy.longlong, numpy.longlong(1), False),
        (numpy.timedelta64, numpy.timedelta64(1, 'D'), False),
        (numpy.uint8, numpy.uint8(1), False),
        (numpy.uint16, numpy.uint16(1), False),
        (numpy.uint32, numpy.uint32(1), False),
        (numpy.uint64, numpy.uint64(1), False),
        (numpy.ulonglong, numpy.ulonglong(1), False),
        (numpy.float16, numpy.float16(1.0), False),
        (numpy.float32, numpy.float32(1.0), False),
        (numpy.float64, numpy.float64(1.0), False),
        (numpy.longdouble, numpy.longdouble(1.0), False),
        (numpy.complex64, numpy.complex64(1 + 2j), False),
        (numpy.complex128, numpy.complex128(1 + 2j), False),
        (numpy.clongdouble, numpy.clongdouble(1 + 2j), False),
        (numpy.bytes_, numpy.bytes_('test', encoding='utf-8'), False),
        (numpy.str_, numpy.str_('test'), False),
        (numpy.void, numpy.void(b'test'), False),
        (numpy.bool_, numpy.bool_(True), False),
        (numpy.datetime64, numpy.datetime64('2023-10-04'), False),
        (pandas.arrays.IntervalArray, pandas.arrays.IntervalArray.from_tuples([(0, 1), (2, 3)]), True),
        (pandas.arrays.PeriodArray, pandas.period_range(start='2000Q1', end='2000Q2', freq='Q').array, True),
        (pandas.arrays.DatetimeArray, pandas.to_datetime(['2000-01-01', '2000-01-02']).array, False),
        (pandas.arrays.IntegerArray, pandas.array([1, 2, 3], dtype='Int32'), False),
        (pandas.arrays.FloatingArray, pandas.array([1.0, 2.0, 3.0], dtype='Float64'), False),
        (pandas.arrays.StringArray, pandas.array(['a', 'b', 'c']), False),
        (pandas.arrays.BooleanArray, pandas.array([True, False, True]), False),
        (pandas.Series, pandas.Series([1, 2, 3]), False),
        (pandas.Index, pandas.Index([1, 2, 3]), False),
        (pandas.Timestamp, pandas.Timestamp('2023-10-04'), False),
        (pandas.DataFrame, df_with_datetime_index, True),
    ],
)
def test_serialization_deserialization(type_, value, raise_):
    encoder = encoder_registry[type_]
    serialized = json.dumps(encoder['serialize'](value))

    if raise_:
        with pytest.raises(NotImplementedError):
            encoder['deserialize'](json.loads(serialized))
        return

    deserialized = encoder['deserialize'](json.loads(serialized))

    # If it's a pandas type use built-in equality
    if isinstance(value, pandas.Series) or isinstance(value, pandas.Index):
        assert value.equals(deserialized)
    # Handle pandas arrays
    elif isinstance(value, ExtensionArray):
        assert numpy.array_equal(value, deserialized)
    else:
        assert numpy.array_equal(value, deserialized) or value == deserialized

def test_deserialize_empty_param():
    assert deserialize('foo', Parameter.empty) == 'foo'

# Must be async so async runtime is initialized
async def test_deserialize_task():
    task = PendingTask(None, None)
    assert deserialize(task, str) == task

def test_deserialize_no_type():
    assert deserialize('foo', None) == 'foo'

def test_deserialize_same_type():
    assert deserialize('foo', str) == 'foo'
    assert deserialize(1, int) == 1
    assert deserialize(1.0, float) == 1.0

    # Class instance
    class Foo:
        pass

    foo = Foo()
    assert deserialize(foo, Foo) == foo

    # Pydantic base model
    class Bar(BaseModel):
        value: str

    bar = Bar(value='foo')
    assert deserialize(bar, Bar) == bar

def test_deserialize_error_raises():
    # Test that if deserialize errors, an error is raised
    with pytest.raises(ValueError):
        deserialize('foo', int)


def test_deserialize_UNION_type():
    """Unions are not supported"""
    typ = Union[str, int]
    assert deserialize('foo', typ) == 'foo'

def test_deserialize_optional():
    assert deserialize(None, Optional[int]) == None
    assert deserialize('123', Optional[int]) == 123
    assert deserialize('123', Union[int, None]) == 123
    assert deserialize('123', Union[None, int]) == 123

