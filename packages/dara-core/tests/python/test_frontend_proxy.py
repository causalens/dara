"""Development proxy failures respect the ASGI response lifecycle."""

import asyncio
import gzip
import json
import os
import re
import socket
from contextlib import asynccontextmanager, nullcontext
from pathlib import Path

import anyio
import httpx
import pytest
import uvicorn
from starlette.applications import Starlette
from starlette.routing import Mount
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed, InvalidStatus

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

    received = False

    async def receive():
        nonlocal received
        if received:
            await anyio.sleep_forever()
        received = True
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


@pytest.fixture
def ready_frontend(monkeypatch):
    def ready(origin):
        monkeypatch.setattr(runtime, 'frontend_status', lambda root: {'state': 'ready', 'origin': origin})

    return ready


@pytest.mark.parametrize('prefix', ['', '/nested/app', '/café'])
@pytest.mark.parametrize('suffix', ['a%23b.js', 'a%3Fb.js', 'a%25b.js', 'a%2Fb.js', '%E2%98%83.js'])
async def test_http_preserves_encoded_paths_through_mount(tmp_path, monkeypatch, ready_frontend, prefix, suffix):
    from urllib.parse import quote

    forwarded = []

    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'ok'

    def respond(request):
        forwarded.append(request.url.raw_path)
        return httpx.Response(200, stream=Stream())

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        runtime.httpx, 'AsyncClient', lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw)
    )
    ready_frontend('http://127.0.0.1:1234')
    app = Starlette(routes=[Mount(prefix + '/static', runtime.FrontendProxy(tmp_path, prefix))])
    target = quote(prefix, safe='/') + '/static/' + suffix + '?token=a%2Fb&import&v=1&v=2'
    async with real_client(transport=httpx.ASGITransport(app), base_url='http://test') as client:
        response = await client.get(target)
    assert response.status_code == 200
    assert forwarded == [target.encode('ascii')]


@pytest.mark.parametrize(
    ('raw_path', 'expected'),
    [
        (None, b'/static/a%23b.js?t=1'),
        (b'/%73tatic/a%23b.js', b'/static/a%23b.js?t=1'),
        (b'/static%2Fa%23b.js', b'/static%2Fa%23b.js?t=1'),
        (b'/static%2fa%23b.js', b'/static%2fa%23b.js?t=1'),
    ],
)
async def test_proxy_handles_optional_raw_path_and_encoded_mount(raw_path, expected):
    scope = {'path': '/static/a#b.js', 'root_path': '/static', 'query_string': b't=1'}
    if raw_path is not None:
        scope['raw_path'] = raw_path
    assert runtime._proxy_url(scope, 'http://127.0.0.1:1234', '/static/').raw_path == expected


async def test_http_streams_upload_and_compressed_response_without_losing_headers(
    tmp_path, monkeypatch, ready_frontend
):
    compressed = gzip.compress(b'first response chunk and second response chunk')
    received = []

    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield compressed[:10]
            yield compressed[10:]

    async def respond(request):
        received.append(request)
        assert await request.aread() == b'firstsecond'
        return httpx.Response(
            206,
            headers=[
                ('content-encoding', 'gzip'),
                ('content-length', str(len(compressed))),
                ('set-cookie', 'one=1'),
                ('set-cookie', 'two=2'),
                ('connection', 'x-upstream-only'),
                ('x-upstream-only', 'secret'),
                ('content-range', 'bytes 0-41/42'),
            ],
            stream=Stream(),
        )

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        runtime.httpx, 'AsyncClient', lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw)
    )
    ready_frontend('http://127.0.0.1:1234')
    body = iter([b'first', b'second'])

    async def receive():
        chunk = next(body, None)
        if chunk is None:
            await anyio.sleep_forever()
        return {'type': 'http.request', 'body': chunk, 'more_body': chunk == b'first'}

    messages = []

    async def send(message):
        messages.append(message)

    await runtime.FrontendProxy(tmp_path, '')(
        {
            'type': 'http',
            'method': 'POST',
            'path': '/asset.js',
            'headers': [
                (b'host', b'public.example'),
                (b'connection', b'x-browser-only, Keep-Alive'),
                (b'x-browser-only', b'secret'),
                (b'cookie', b'session=123'),
                (b'range', b'bytes=0-41'),
            ],
        },
        receive,
        send,
    )
    assert received[0].headers['host'] == '127.0.0.1:1234'
    assert received[0].headers['cookie'] == 'session=123'
    assert received[0].headers['range'] == 'bytes=0-41'
    assert 'x-browser-only' not in received[0].headers
    assert messages[0]['status'] == 206
    headers = messages[0]['headers']
    assert [value for key, value in headers if key == b'set-cookie'] == [b'one=1', b'two=2']
    assert b'x-upstream-only' not in dict(headers)
    assert dict(headers)[b'content-encoding'] == b'gzip'
    assert b''.join(message.get('body', b'') for message in messages) == compressed


@pytest.mark.parametrize('phase', ['headers', 'body'])
async def test_browser_disconnect_cancels_stalled_http(tmp_path, monkeypatch, ready_frontend, phase):
    waiting = anyio.Event()
    closed = anyio.Event()

    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'first chunk'
            waiting.set()
            await anyio.sleep_forever()

        async def aclose(self):
            closed.set()

    async def respond(request):
        if phase == 'headers':
            waiting.set()
            try:
                await anyio.sleep_forever()
            finally:
                closed.set()
        return httpx.Response(200, stream=Stream())

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        runtime.httpx, 'AsyncClient', lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw)
    )
    ready_frontend('http://127.0.0.1:1234')
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {'type': 'http.request', 'body': b'', 'more_body': False}
        await waiting.wait()
        return {'type': 'http.disconnect'}

    async def send(message):
        pass

    with anyio.fail_after(1):
        await runtime.FrontendProxy(tmp_path, '')(
            {'type': 'http', 'method': 'GET', 'path': '/slow', 'headers': []}, receive, send
        )
    assert closed.is_set()


@asynccontextmanager
async def running_proxy(tmp_path, ready_frontend, upstream_origin, prefix=''):
    """Exercise the real ASGI WebSocket/HTTP protocol implementation on an ephemeral port."""
    if upstream_origin is not None:
        ready_frontend(upstream_origin)
    app = Starlette(routes=[Mount(prefix + '/static', runtime.FrontendProxy(tmp_path, prefix))])
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app, lifespan='off', log_level='warning', timeout_graceful_shutdown=1))
        server.capture_signals = nullcontext
        task = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            with anyio.fail_after(5):
                while not server.started:
                    if task.done():
                        await task
                    await anyio.sleep(0.01)
            yield f'http://127.0.0.1:{port}{prefix}/static'
        finally:
            server.should_exit = True
            with anyio.fail_after(5):
                await task


@pytest.mark.parametrize('prefix', ['', '/nested/app'])
@pytest.mark.parametrize('close_code', [1000, 1012, 4001])
async def test_websocket_round_trip_and_upstream_close(tmp_path, ready_frontend, caplog, prefix, close_code):
    requests = []

    async def handler(connection):
        requests.append(connection.request)
        assert connection.subprotocol == 'vite-hmr'
        await connection.send('connected')
        async for message in connection:
            if message == 'close':
                await connection.close(close_code, 'restarting')
                return
            await connection.send(message)

    async with serve(handler, '127.0.0.1', 0, subprotocols=['vite-hmr']) as upstream:
        origin = f'http://127.0.0.1:{upstream.sockets[0].getsockname()[1]}'
        async with running_proxy(tmp_path, ready_frontend, origin, prefix) as public:
            async with connect(
                public.replace('http:', 'ws:') + '/@dara/hmr?token=a%2Fb', subprotocols=['vite-hmr'], proxy=None
            ) as browser:
                assert browser.subprotocol == 'vite-hmr'
                assert await browser.recv() == 'connected'
                for message in ['hot update', b'\x00\x01binary']:
                    await browser.send(message)
                    assert await browser.recv() == message
                await browser.send('close')
                with pytest.raises(ConnectionClosed):
                    await browser.recv()
                assert browser.close_code == close_code
                assert browser.close_reason == 'restarting'
    assert requests[0].path == prefix + '/static/@dara/hmr?token=a%2Fb'
    assert not [record for record in caplog.records if record.levelname == 'ERROR']


@pytest.mark.parametrize('side', ['upstream', 'browser', 'normal_browser'])
async def test_websocket_disconnect_releases_both_sides_and_reconnects(tmp_path, ready_frontend, caplog, side):
    closed = anyio.Event()
    close_codes = []
    count = 0

    async def handler(connection):
        nonlocal count
        count += 1
        current = count
        await connection.send('connected')
        if side == 'upstream' and current == 1:
            connection.transport.abort()
        await connection.wait_closed()
        if current == 1:
            close_codes.append(connection.close_code)
            closed.set()

    async with serve(handler, '127.0.0.1', 0, subprotocols=['vite-hmr']) as upstream:
        origin = f'http://127.0.0.1:{upstream.sockets[0].getsockname()[1]}'
        async with running_proxy(tmp_path, ready_frontend, origin) as public:
            target = public.replace('http:', 'ws:') + '/@dara/hmr'
            async with connect(target, subprotocols=['vite-hmr'], proxy=None) as browser:
                assert await browser.recv() == 'connected'
                if side == 'browser':
                    browser.transport.abort()
                elif side == 'normal_browser':
                    await browser.close(4002, 'leaving')
                else:
                    with pytest.raises(ConnectionClosed):
                        await browser.recv()
                    assert browser.close_code == 1011
                with anyio.fail_after(2):
                    await closed.wait()
            if side == 'normal_browser':
                assert close_codes == [4002]
            elif side == 'browser':
                # ASGI implementations report an absent close frame as 1005 or 1006.
                assert len(close_codes) == 1 and close_codes[0] in (1000, 1011)
            async with connect(target, subprotocols=['vite-hmr'], proxy=None) as browser:
                assert await browser.recv() == 'connected'
    assert not [record for record in caplog.records if record.levelname == 'ERROR']


@pytest.mark.parametrize('failure', ['reject', 'timeout'])
async def test_websocket_upgrade_failure_is_clean_and_recoverable(
    tmp_path, monkeypatch, ready_frontend, caplog, failure
):
    release = anyio.Event()
    rejected = False

    async def process_request(connection, request):
        nonlocal rejected
        if not rejected:
            rejected = True
            if failure == 'timeout':
                await release.wait()
            return connection.respond(503, 'restarting')
        return None

    async def handler(connection):
        await connection.send('recovered')

    monkeypatch.setattr(runtime, '_WEBSOCKET_OPEN_TIMEOUT', 0.1)
    async with serve(handler, '127.0.0.1', 0, process_request=process_request, subprotocols=['vite-hmr']) as upstream:
        origin = f'http://127.0.0.1:{upstream.sockets[0].getsockname()[1]}'
        async with running_proxy(tmp_path, ready_frontend, origin) as public:
            target = public.replace('http:', 'ws:') + '/@dara/hmr'
            try:
                with anyio.fail_after(2), pytest.raises(InvalidStatus) as error:
                    async with connect(target, subprotocols=['vite-hmr'], proxy=None):
                        pytest.fail('Unavailable frontend must not accept the upgrade')
                assert error.value.response.status_code == 403
                async with connect(target, subprotocols=['vite-hmr'], proxy=None) as browser:
                    assert await browser.recv() == 'recovered'
            finally:
                release.set()
    # The deliberately timed-out upstream may log its abandoned handshake; the ASGI proxy must not.
    assert not [
        record for record in caplog.records if record.levelname == 'ERROR' and record.name.startswith('uvicorn')
    ]


@pytest.mark.parametrize('phase', ['headers', 'body'])
@pytest.mark.parametrize('disconnect', [True, False])
async def test_real_http_stalls_release_upstream(tmp_path, monkeypatch, ready_frontend, phase, disconnect):
    """A real stalled TCP response is cancelled by browser loss or the upstream idle deadline."""
    started = anyio.Event()
    closed = anyio.Event()
    writers = []

    async def handler(reader, writer):
        writers.append(writer)
        try:
            await reader.readuntil(b'\r\n\r\n')
            if phase == 'body':
                writer.write(b'HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\nfirst chunk')
                await writer.drain()
            started.set()
            await reader.read()
        finally:
            writer.close()
            await writer.wait_closed()
            closed.set()

    monkeypatch.setattr(runtime, '_PROXY_TIMEOUT', httpx.Timeout(connect=1, read=0.3, write=1, pool=1))
    async with await asyncio.start_server(handler, '127.0.0.1', 0) as upstream:
        origin = f'http://127.0.0.1:{upstream.sockets[0].getsockname()[1]}'
        try:
            async with running_proxy(tmp_path, ready_frontend, origin) as public:
                with anyio.fail_after(3):
                    if disconnect:
                        url = httpx.URL(public)
                        _, writer = await asyncio.open_connection(url.host, url.port)
                        writer.write(b'GET /static/slow HTTP/1.1\r\nHost: localhost\r\n\r\n')
                        await writer.drain()
                        await started.wait()
                        writer.close()
                        await writer.wait_closed()
                    else:
                        async with httpx.AsyncClient(trust_env=False) as browser:
                            if phase == 'headers':
                                assert (await browser.get(public + '/slow')).status_code == 503
                            else:
                                with pytest.raises(httpx.RemoteProtocolError):
                                    await browser.get(public + '/slow')
                    await closed.wait()
        finally:
            for writer in writers:
                writer.close()
                await writer.wait_closed()


async def test_http_upload_disconnect_does_not_start_response(tmp_path, monkeypatch, ready_frontend):
    async def respond(request):
        await request.aread()
        pytest.fail('An incomplete upload must not reach the response')

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        runtime.httpx, 'AsyncClient', lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw)
    )
    ready_frontend('http://127.0.0.1:1234')
    events = iter(
        [
            {'type': 'http.request', 'body': b'partial upload', 'more_body': True},
            {'type': 'http.disconnect'},
        ]
    )

    async def receive():
        return next(events)

    async def send(message):
        pytest.fail('A disconnected browser must not receive a response')

    with anyio.fail_after(1):
        await runtime.FrontendProxy(tmp_path, '')(
            {'type': 'http', 'method': 'POST', 'path': '/upload', 'headers': []}, receive, send
        )


async def test_websocket_request_cancellation_closes_upstream(tmp_path, ready_frontend):
    accepted = anyio.Event()
    closed = anyio.Event()

    async def handler(connection):
        await connection.wait_closed()
        closed.set()

    async with serve(handler, '127.0.0.1', 0, subprotocols=['vite-hmr']) as upstream:
        ready_frontend(f'http://127.0.0.1:{upstream.sockets[0].getsockname()[1]}')
        connected = False
        events = []

        async def receive():
            nonlocal connected
            if not connected:
                connected = True
                return {'type': 'websocket.connect'}
            await anyio.sleep_forever()

        async def send(message):
            events.append(message)
            if message['type'] == 'websocket.accept':
                accepted.set()

        with anyio.fail_after(3):
            async with anyio.create_task_group() as group:
                group.start_soon(
                    runtime.FrontendProxy(tmp_path, ''),
                    {
                        'type': 'websocket',
                        'path': '/@dara/hmr',
                        'headers': [],
                        'subprotocols': ['vite-hmr'],
                    },
                    receive,
                    send,
                )
                await accepted.wait()
                group.cancel_scope.cancel()
            await closed.wait()
        assert [event['type'] for event in events] == ['websocket.accept', 'websocket.close']


async def test_real_vite_hmr_and_configuration_recovery_through_python(tmp_path, ready_frontend):
    """Load real Vite modules and exchange HMR through Python, including a restarted runner."""
    plugin = Path(__file__).resolve().parents[3] / 'vite-plugin'
    runner = plugin / 'dist/cli.js'
    assert runner.is_file(), 'Build @darajs/vite-plugin before running proxy integration tests'
    private = tmp_path / 'node_modules/.dara'
    private.mkdir(parents=True)
    core = tmp_path / 'node_modules/@darajs/core'
    core.mkdir(parents=True)
    (core.parent / 'vite-plugin').symlink_to(plugin, target_is_directory=True)
    for dependency in ('react', 'react-dom'):
        (tmp_path / 'node_modules' / dependency).symlink_to(
            (Path(__file__).resolve().parents[2] / 'node_modules' / dependency).resolve(), target_is_directory=True
        )
    (core / 'package.json').write_text(
        json.dumps(
            {
                'name': '@darajs/core',
                'type': 'module',
                'exports': {'./bootstrap': './bootstrap.js'},
            }
        )
    )
    (core / 'bootstrap.js').write_text('export default () => {};\n')
    (tmp_path / 'package.json').write_text('{"name":"proxy-test","type":"module"}')
    (tmp_path / 'pnpm-workspace.yaml').write_text('catalogs:\n  dara: {}\n')
    (tmp_path / 'tsconfig.preset.json').write_bytes((plugin / 'tsconfig.json').read_bytes())
    (tmp_path / 'tsconfig.json').write_text('{"extends":"./tsconfig.preset.json","include":["js"]}')
    config = tmp_path / 'vite.config.ts'
    # Poll temporary fixture files so platform watcher behavior does not affect proxy assertions.
    valid_config = (
        "import dara from '@darajs/vite-plugin';\n"
        'export default {plugins: [dara()], server: {watch: {usePolling: true, interval: 50}}};\n'
    )
    config.write_text(valid_config)
    source = tmp_path / 'js/index.tsx'
    source.parent.mkdir()
    source.write_text('export const value = 1;\nif (import.meta.hot) import.meta.hot.accept();\n')
    version = json.loads((plugin / 'package.json').read_text())['version']
    (private / 'manifest.dev.json').write_text(
        json.dumps(
            {
                'schema': 1,
                'configuration': 'app:config',
                'daraVersion': version,
                'packageRequirements': [],
                'moduleDependencies': [],
                'components': [],
                'actions': [],
                'auth': [],
                'static': [],
                'appStatic': [],
                'outDir': 'dist',
                'favicon': None,
            }
        )
    )
    (private / 'supervisor.json').write_text(json.dumps({'pid': os.getpid(), 'token': 'proxy-test'}))
    prefix = '/nested/app'
    log = tmp_path / 'runner.log'
    with log.open('w') as output:
        process = await asyncio.create_subprocess_exec(
            'node',
            str(runner),
            'serve',
            '--root',
            str(tmp_path),
            '--base-url',
            prefix,
            '--token',
            'proxy-test',
            '--no-typecheck',
            stdout=output,
            stderr=asyncio.subprocess.STDOUT,
        )

    async def wait_state(state):
        with anyio.fail_after(15):
            while runtime.frontend_status(tmp_path).get('state') != state:
                assert process.returncode is None, log.read_text()
                await anyio.sleep(0.05)

    async def next_message(browser, kind):
        with anyio.fail_after(10):
            while True:
                message = json.loads(await browser.recv())
                if message['type'] == kind:
                    return message

    async def hmr_url(client, public):
        response = await client.get(public + '/@vite/client')
        assert response.status_code == 200
        token = re.search(r'const wsToken = "([^"]+)"', response.text)
        assert token is not None
        return public.replace('http:', 'ws:') + '/@dara/hmr?token=' + token[1]

    try:
        await wait_state('ready')
        async with running_proxy(tmp_path, ready_frontend, None, prefix) as public:
            async with httpx.AsyncClient(trust_env=False) as client:
                async with connect(await hmr_url(client, public), subprotocols=['vite-hmr'], proxy=None) as browser:
                    await next_message(browser, 'connected')
                    assert (await client.get(public + '/@dara/entry')).status_code == 200
                    response = await client.get(public + '/js/index.tsx')
                    assert response.status_code == 200 and 'value = 1' in response.text
                    source.write_text('export const value = 2;\nif (import.meta.hot) import.meta.hot.accept();\n')
                    message = await next_message(browser, 'update')
                    assert any(update['path'].endswith('/js/index.tsx') for update in message['updates'])
                    assert 'value = 2' in (await client.get(public + '/js/index.tsx')).text
                    (private / 'backend-ready.json').write_text('{}')
                    await next_message(browser, 'full-reload')
                    config.write_text('export default { invalid syntax;')
                    await wait_state('blocked')
                    assert (await client.get(public + '/js/index.tsx')).status_code == 503
                    with pytest.raises(InvalidStatus):
                        async with connect(
                            public.replace('http:', 'ws:') + '/@dara/hmr', subprotocols=['vite-hmr'], proxy=None
                        ):
                            pytest.fail('Blocked frontend must refuse new upgrades')
                config.write_text(valid_config)
                await wait_state('ready')
                assert (await client.get(public + '/js/index.tsx')).status_code == 200
                async with connect(await hmr_url(client, public), subprotocols=['vite-hmr'], proxy=None) as browser:
                    await next_message(browser, 'connected')
    except BaseException:
        print(log.read_text())
        raise
    finally:
        if process.returncode is None:
            process.terminate()
            try:
                with anyio.fail_after(5):
                    await process.wait()
            finally:
                if process.returncode is None:
                    process.kill()
                    await process.wait()
    assert process.returncode == 0, log.read_text()


@pytest.mark.parametrize('partial', [False, True])
async def test_stalled_upload_has_an_idle_deadline(tmp_path, monkeypatch, ready_frontend, partial):
    async def respond(request):
        await request.aread()
        pytest.fail('The incomplete upload must time out')

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        runtime.httpx, 'AsyncClient', lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw)
    )
    monkeypatch.setattr(runtime, '_PROXY_TIMEOUT', httpx.Timeout(connect=1, read=1, write=0.05, pool=1))
    ready_frontend('http://127.0.0.1:1234')
    received = False

    async def receive():
        nonlocal received
        if partial and not received:
            received = True
            return {'type': 'http.request', 'body': b'partial upload', 'more_body': True}
        await anyio.sleep_forever()

    messages = []

    async def send(message):
        messages.append(message)

    with anyio.fail_after(1):
        await runtime.FrontendProxy(tmp_path, '')(
            {'type': 'http', 'method': 'POST', 'path': '/upload', 'headers': []}, receive, send
        )
    assert [message['status'] for message in messages if message['type'] == 'http.response.start'] == [408]


async def test_unavailable_upstream_connection_returns_bounded_failures(tmp_path, monkeypatch, ready_frontend, caplog):
    monkeypatch.setattr(runtime, '_PROXY_TIMEOUT', httpx.Timeout(connect=0.2, read=1, write=1, pool=1))
    monkeypatch.setattr(runtime, '_WEBSOCKET_OPEN_TIMEOUT', 0.2)
    # Keep the port reserved without listening, so another test cannot reuse it.
    with socket.socket() as unavailable:
        unavailable.bind(('127.0.0.1', 0))
        origin = f'http://127.0.0.1:{unavailable.getsockname()[1]}'
        async with running_proxy(tmp_path, ready_frontend, origin) as public:
            async with httpx.AsyncClient(trust_env=False) as browser:
                assert (await browser.get(public + '/asset.js')).status_code == 503
            with pytest.raises(InvalidStatus) as error:
                async with connect(public.replace('http:', 'ws:') + '/@dara/hmr', proxy=None):
                    pytest.fail('Unavailable frontend must refuse the upgrade')
            assert error.value.response.status_code == 403
    assert not [record for record in caplog.records if record.levelname == 'ERROR']
