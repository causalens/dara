from datetime import datetime
from os import path
from pathlib import Path

import numpy
import pandas

from dara.components.smart.data_slicer.extension.data_slicer_filter import FilterInstance
from dara.components.smart.data_slicer.utils.core import apply_filters


def get_test_data() -> pandas.DataFrame:
    data = pandas.read_csv(path.join(Path(__file__).parent.parent.absolute(), 'data/churn_data_clean.csv'))
    data['Renewal Date'] = data['Renewal Date'].apply(lambda x: datetime.strptime(x, '%Y-%m-%d'))
    # add index as ID column
    data['ID'] = data.index
    return data


DATA = get_test_data()


def test_empty_filters():
    filter_cases = [
        [],
        [FilterInstance(column='ID', range='', values='', from_date='', to_date='')],
        [FilterInstance(column='', range='', values='', from_date='', to_date='')],
        [FilterInstance(column=None, range='', values='', from_date='', to_date='')],
    ]

    # Each of the cases should result in full dataset being returned
    for case in filter_cases:
        filtered_data = apply_filters(case, DATA)
        assert filtered_data['ID'].values.tolist() == DATA['ID'].values.tolist()


def test_values_numeric_filter():
    filter_instance = FilterInstance(column='ID', range='', values='1,5,10', from_date='', to_date='')

    filtered_data = apply_filters([filter_instance], DATA)

    ids = filtered_data['ID'].values.tolist()
    assert ids.sort() == ['1', '5', '10'].sort()


def test_values_categorical_filter():
    filter_instance = FilterInstance(column='Gender', range='', values='Male', from_date='', to_date='')

    filtered_data = apply_filters([filter_instance], DATA)

    expected_ids = filtered_data[filtered_data['Gender'] == 'Male']['ID'].values.tolist()
    assert filtered_data['ID'].values.tolist().sort() == expected_ids.sort()


def test_values_categorical_case_sensitive_filter():
    filter_instance = FilterInstance(column='Gender', range='', values='male', from_date='', to_date='')

    filtered_data = apply_filters([filter_instance], DATA)

    assert len(filtered_data.index.tolist()) == 0


def test_values_whitespace_filter():
    """
    Make sure whitespace is ignored
    """
    filter_instance = FilterInstance(column='ID', range='', values='   1  ,  5  ,  10 ', from_date='', to_date='')

    filtered_data = apply_filters([filter_instance], DATA)

    ids = filtered_data['ID'].values.tolist()
    assert ids.sort() == ['1', '5', '10'].sort()


def test_values_not_allowed_filter():
    """
    Check values filter does not do anything for i.e. datetime column
    """
    filter_instance = FilterInstance(column='Renewal Date', range='', values='1,5,10', from_date='', to_date='')

    filtered_data = apply_filters([filter_instance], DATA)

    # Filtered = unfiltered
    assert filtered_data['ID'].values.tolist() == DATA['ID'].values.tolist()


def test_values_numerical_invalid_filter():
    """
    Check values filter does not do anything if it contains non-numeric values for numeric columns
    """
    filter_instance = FilterInstance(column='ID', range='', values='1,test', from_date='', to_date='')
    filtered_data = apply_filters([filter_instance], DATA)
    assert filtered_data['ID'].values.tolist() == DATA['ID'].values.tolist()


def test_values_categorical_mixed_filter():
    """
    Check for categorical columns values can contain mixed values
    """
    filter_instance = FilterInstance(column='Gender', range='', values='Male,1', from_date='', to_date='')

    filtered_data = apply_filters([filter_instance], DATA)

    expected_ids = filtered_data[filtered_data['Gender'] == 'Male']['ID'].values.tolist()
    assert filtered_data['ID'].values.tolist().sort() == expected_ids.sort()


def test_range_invalid_filter():
    """
    Check range filter does not do anything if one of the bounds is empty or not a number (or infinity)
    """
    filter_cases = [
        [FilterInstance(column='ID', range='[]', values='', from_date='', to_date='')],
        [FilterInstance(column='ID', range='[1,]', values='', from_date='', to_date='')],
        [FilterInstance(column='ID', range='[0,]', values='', from_date='', to_date='')],
        [FilterInstance(column='ID', range='[0]', values='', from_date='', to_date='')],
        [FilterInstance(column='ID', range='0,', values='', from_date='', to_date='')],
        [FilterInstance(column='ID', range=',', values='', from_date='', to_date='')],
        [FilterInstance(column='ID', range='1,2', values='', from_date='', to_date='')],
        [FilterInstance(column='ID', range='[1,test]', values='', from_date='', to_date='')],
        [FilterInstance(column='ID', range='[test,10]', values='', from_date='', to_date='')],
    ]

    # Each of the cases should result in full dataset being returned
    for case in filter_cases:
        filtered_data = apply_filters(case, DATA)
        assert filtered_data['ID'].values.tolist() == DATA['ID'].values.tolist()


def test_range_infinity_filter():
    filter_instance = FilterInstance(column='Sales Calls', range='[:,:]', values='', from_date='', to_date='')
    filtered_data = apply_filters([filter_instance], DATA)

    assert filtered_data['ID'].values.tolist() == DATA['ID'].values.tolist()


def test_range_plus_infinity_filter():
    filter_instance = FilterInstance(column='Sales Calls', range='[3,:]', values='', from_date='', to_date='')
    filtered_data = apply_filters([filter_instance], DATA)

    assert filtered_data['ID'].values.tolist() == DATA[DATA['Sales Calls'] >= 3]['ID'].values.tolist()


def test_range_minus_infinity_filter():
    filter_instance = FilterInstance(column='Sales Calls', range='[:, 3]', values='', from_date='', to_date='')
    filtered_data = apply_filters([filter_instance], DATA)

    assert filtered_data['ID'].values.tolist() == DATA[DATA['Sales Calls'] <= 3]['ID'].values.tolist()


def test_date_from_filter():
    date = '2020-01-01T00:00:00+00:00'
    date_numpy = numpy.datetime64(datetime.fromisoformat(date))
    filter_instance = FilterInstance(column='Renewal Date', range='', values='', from_date=date, to_date='')
    filtered_data = apply_filters([filter_instance], DATA)

    assert filtered_data['ID'].values.tolist() == DATA[DATA['Renewal Date'] > date_numpy]['ID'].values.tolist()


def test_date_to_filter():
    date = '2020-01-01T00:00:00+00:00'
    date_numpy = numpy.datetime64(datetime.fromisoformat(date))
    filter_instance = FilterInstance(column='Renewal Date', range='', values='', from_date='', to_date=date)
    filtered_data = apply_filters([filter_instance], DATA)

    assert filtered_data['ID'].values.tolist() == DATA[DATA['Renewal Date'] < date_numpy]['ID'].values.tolist()


def test_date_between_filter():
    date_from = '2019-01-01T00:00:00+00:00'
    date_from_numpy = numpy.datetime64(datetime.fromisoformat(date_from))

    date_to = '2020-01-01T00:00:00+00:00'
    date_to_numpy = numpy.datetime64(datetime.fromisoformat(date_to))

    filter_instance = FilterInstance(column='Renewal Date', range='', values='', from_date=date_from, to_date=date_to)
    filtered_data = apply_filters([filter_instance], DATA)

    assert (
        filtered_data['ID'].values.tolist()
        == DATA[(DATA['Renewal Date'] > date_from_numpy) & (DATA['Renewal Date'] < date_to_numpy)]['ID'].values.tolist()
    )
