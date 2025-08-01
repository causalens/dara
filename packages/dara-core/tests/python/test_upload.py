import io
import os
import re
from typing import Optional, Union

import numpy
import pytest
from async_asgi_testclient import TestClient
from async_asgi_testclient.multipart import encode_multipart_formdata
from pandas import DataFrame, Timestamp, read_csv, read_excel, to_datetime

from dara.core.auth import BasicAuthConfig
from dara.core.base_definitions import Action, UploadResolverDef
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import DataVariable, Variable  # noqa: F401
from dara.core.interactivity.any_data_variable import upload as upload_impl
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.main import _start_application

pytestmark = [pytest.mark.anyio, pytest.mark.xdist_group(name='upload')]

os.environ['DARA_DOCKER_MODE'] = 'TRUE'


async def login(client: TestClient) -> dict:
    token = (
        (
            await client.post(
                '/api/auth/session',
                json={'username': 'cl', 'password': 'data_ext'},
                headers={'Accept': 'application/json'},
            )
        )
        .json()
        .get('token')
    )
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture(autouse=True)
def reset_data_variable_cache():
    """
    Reset the data variable cache between tests
    """
    from dara.core.internal.registries import data_variable_registry

    data_variable_registry.replace({})
    yield


class MockComponent(ComponentInstance):
    text: Union[str, DataVariable, DerivedVariable]
    action: Optional[Action] = None

    def __init__(self, text: Union[str, DataVariable, DerivedVariable], action: Optional[Action] = None):
        super().__init__(text=text, uid='uid', action=action)


MockComponent.model_rebuild()


async def test_upload_data_variable_default_csv():
    builder = ConfigurationBuilder()
    builder.add_page('Test', content=lambda: MockComponent(text=DataVariable(uid='uid')))
    builder.add_auth(BasicAuthConfig(username='cl', password='data_ext'))
    config = builder._to_configuration()

    # Run the app so the component is initialized
    app = _start_application(config)

    async with TestClient(app) as client:
        AUTH_HEADERS = await login(client)

        # read directly for reference
        file_content = read_csv(os.path.join('./tests/data/churn_data_clean.csv'), engine='c', index_col=0)
        file_content.columns = file_content.columns.str.replace('Unnamed: *', 'column_', regex=True)

        with open(os.path.join('./tests/data/churn_data_clean.csv'), 'rb') as f:
            response = await client.post(
                '/api/core/data/upload?data_uid=uid',
                files={'data': ('churn_data_clean.csv', f)},
                headers=AUTH_HEADERS,
            )
            assert response.status_code == 200
            assert response.json()['status'] == 'SUCCESS'

        # Check file can be retrieved
        response = await client.post('/api/core/data-variable/uid?limit=15', headers=AUTH_HEADERS, json={})
        assert response.status_code == 200

        response_data = DataFrame.from_records(response.json())

        # Response should have a generated index column
        assert '__index__' in response_data.columns
        file_content['__index__'] = range(len(file_content.values))

        # The non-autogenerated data index should be the same
        file_content = file_content.reset_index(names=['index'])

        # All columns should be in the response
        assert len(file_content.columns) == len(response_data.columns)

        # Compare the content of each reference columns is the same
        for col in response_data.columns:
            list_1 = response_data[col].tolist()
            # Strip the internal prefixes
            col = re.sub(r'__index__\d+__', '', col)
            col = re.sub(r'__col__\d+__', '', col)
            list_2 = file_content[col][:15].tolist()

            if isinstance(list_1[0], float):
                assert numpy.allclose(list_1, list_2)
            else:
                assert list_1 == list_2


async def test_upload_data_variable_resolver_csv():
    builder = ConfigurationBuilder()
    builder.add_page('Test', content=lambda: MockComponent(text=DataVariable(uid='uid')))
    builder.add_auth(BasicAuthConfig(username='cl', password='data_ext'))
    config = builder._to_configuration()

    # Run the app so the component is initialized
    app = _start_application(config)

    # read directly for reference
    file_content = read_csv(os.path.join('./tests/data/churn_data_clean.csv'), engine='c', index_col=0)
    file_content.columns = file_content.columns.str.replace('Unnamed: *', 'Test Rename ', regex=True)

    async with TestClient(app) as client:
        AUTH_HEADERS = await login(client)

        from dara.core.internal.registries import upload_resolver_registry

        def resolver(byt: bytes, filename: str):
            file_object = io.StringIO(byt.decode('utf-8'))
            new_content = read_csv(file_object, index_col=0)
            new_content.columns = new_content.columns.str.replace('Unnamed: *', 'Test Rename ', regex=True)
            return new_content

        upload_resolver_registry.register('test_id', UploadResolverDef(resolver=resolver, upload=upload_impl))

        with open(os.path.join('./tests/data/churn_data_clean.csv'), 'rb') as f:
            # Manually encode the file together with formdata as asynctestclient does not
            # permit passing both json and files at the same time
            form_data, content_type = encode_multipart_formdata(
                {'resolver_id': 'test_id', 'data': ('churn_data_clean.csv', f)}
            )

            response = await client.post(
                '/api/core/data/upload?data_uid=uid',
                data=form_data,
                headers={**AUTH_HEADERS, 'Content-Type': content_type},
            )
            assert response.status_code == 200
            assert response.json()['status'] == 'SUCCESS'

        # Check file can be retrieved
        response = await client.post('/api/core/data-variable/uid?limit=15', headers=AUTH_HEADERS, json={})
        assert response.status_code == 200
        response_data = DataFrame.from_records(response.json())

        # Response should have a generated index column
        assert '__index__' in response_data.columns
        file_content['__index__'] = range(len(file_content.values))

        # The non-autogenerated data index should be the same
        file_content = file_content.reset_index(names=['index'])

        # All columns should be in the response
        assert len(file_content.columns) == len(response_data.columns)

        # Compare the content of each reference columns is the same
        for col in response_data.columns:
            list_1 = response_data[col].tolist()
            # Strip the internal prefixes
            col = re.sub(r'__index__\d+__', '', col)
            col = re.sub(r'__col__\d+__', '', col)
            list_2 = file_content[col][:15].tolist()

            if isinstance(list_1[0], float):
                assert numpy.allclose(list_1, list_2)
            else:
                assert list_1 == list_2


async def test_upload_data_variable_default_xlsx():
    builder = ConfigurationBuilder()
    builder.add_page('Test', content=lambda: MockComponent(text=DataVariable(uid='uid')))
    builder.add_auth(BasicAuthConfig(username='cl', password='data_ext'))
    config = builder._to_configuration()

    # Run the app so the component is initialized
    app = _start_application(config)

    async with TestClient(app) as client:
        AUTH_HEADERS = await login(client)

        # read directly for reference
        file_content = read_excel(os.path.join('./tests/data/churn_data_clean.xlsx'))
        file_content.columns = file_content.columns.str.replace('Unnamed: *', 'column_', regex=True)

        with open(os.path.join('./tests/data/churn_data_clean.xlsx'), 'rb') as f:
            response = await client.post(
                '/api/core/data/upload?data_uid=uid',
                files={'data': ('churn_data_clean.xlsx', f)},
                headers=AUTH_HEADERS,
            )
            assert response.status_code == 200
            assert response.json()['status'] == 'SUCCESS'

        # Check file can be retrieved
        response = await client.post('/api/core/data-variable/uid?limit=15', headers=AUTH_HEADERS, json={})
        assert response.status_code == 200
        response_data = DataFrame.from_records(response.json())

        # Response should have a generated index column
        assert '__index__' in response_data.columns
        file_content['__index__'] = range(len(file_content.values))

        # The non-autogenerated data index should be the same
        file_content = file_content.reset_index(names=['index'])

        # All columns should be in the response
        assert len(file_content.columns) == len(response_data.columns)

        # Compare the content of each reference columns is the same
        for col in response_data.columns:
            list_1 = response_data[col].tolist()
            # Strip the internal prefixes
            col = re.sub(r'__index__\d+__', '', col)
            col = re.sub(r'__col__\d+__', '', col)
            list_2 = file_content[col][:15].tolist()

            if isinstance(list_1[0], float):
                assert numpy.allclose(list_1, list_2)
            # hanadle timestamp
            elif isinstance(list_2[0], Timestamp):
                list_1_as_date = to_datetime(list_1, unit='ns')  # Convert Unix time in nanoseconds to datetime
                assert list_1_as_date.to_list() == list_2  # Assert that they are equal
            else:
                assert list_1 == list_2
