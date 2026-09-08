"""Development proxy failures respect the ASGI response lifecycle."""

import httpx
import pytest

from dara.core.js_tooling import runtime

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize('failure', ['connect', 'read', None])
async def test_proxy_recovers_only_before_response_headers(tmp_path, monkeypatch, failure):
    """Connection failures get diagnostics; interrupted streams abort their single response."""
    closed = []

    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'first chunk'
            if failure == 'read':
                raise httpx.ReadError('Vite restarted')
            yield b'last chunk'

        async def aclose(self):
            closed.append(True)

    def respond(request):
        if failure == 'connect':
            raise httpx.ConnectError('Vite is restarting')
        return httpx.Response(200, stream=Stream())

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        runtime.httpx, 'AsyncClient', lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw)
    )
    monkeypatch.setattr(runtime, 'frontend_status', lambda root: {'state': 'ready', 'origin': 'http://127.0.0.1:1234'})
    messages = []

    async def receive():
        return {'type': 'http.request', 'body': b'', 'more_body': False}

    async def send(message):
        if message['type'] == 'http.response.start':
            assert not messages, 'The proxy attempted to start a second response'
        messages.append(message)

    scope = {
        'type': 'http',
        'method': 'GET',
        'path': '/asset.js',
        'root_path': '',
        'headers': [],
        'query_string': b'',
    }
    proxy = runtime.FrontendProxy(tmp_path, '')
    if failure == 'read':
        with pytest.raises(httpx.ReadError, match='Vite restarted'):
            await proxy(scope, receive, send)
        assert messages[-1]['more_body'] is True
    else:
        await proxy(scope, receive, send)
        assert not messages[-1].get('more_body', False)
    assert messages[0]['status'] == (503 if failure == 'connect' else 200)
    if failure != 'connect':
        assert closed == [True]
