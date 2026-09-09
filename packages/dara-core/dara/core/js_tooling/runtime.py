"""Serve compiled frontend artifacts or proxy the supervised development runner."""

import html
import json
import os
from contextlib import suppress
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, unquote_to_bytes, urlparse

import anyio
import httpx
from fastapi import Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import ClientDisconnect
from starlette.templating import Jinja2Templates
from starlette.types import Receive, Scope, Send
from starlette.websockets import WebSocket, WebSocketDisconnect, WebSocketState
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake, ProtocolError
from websockets.frames import Close

from dara.core.js_tooling.models import ProjectError
from dara.core.js_tooling.project_files import read_json


class ArtifactFiles(StaticFiles):
    """Serve public output while keeping the build marker and raw Jinja template private."""

    def lookup_path(self, path: str):
        """Refuse private output through lexical aliases and internal filesystem links."""
        normalized = os.path.normpath('/' + path).lstrip('/')
        if normalized in ('index.html', '.dara-build.json') or any(
            part.startswith('.dara') for part in Path(path).parts
        ):
            return '', None
        full_path, stat = super().lookup_path(path)
        if stat is not None:
            for directory in self.all_directories:
                resolved = Path(full_path).resolve()
                if resolved.is_relative_to(Path(directory).resolve()):
                    relative = resolved.relative_to(Path(directory).resolve())
                    if relative.as_posix() == 'index.html' or any(part.startswith('.dara') for part in relative.parts):
                        return '', None
        return full_path, stat


def frontend_status(root: Path) -> dict:
    """Accept readiness only from the active supervisor's current runner token."""
    try:
        owner = read_json(root / 'node_modules/.dara/supervisor.json')
        os.kill(owner['pid'], 0)
        state = read_json(root / 'node_modules/.dara/dev-server.json')
        if state.get('token') != owner['token']:
            return {'state': 'waiting'}
        if state.get('state') == 'ready':
            origin = urlparse(state['origin'])
            if origin.scheme != 'http' or origin.hostname != '127.0.0.1' or not origin.port:
                return {'state': 'blocked', 'diagnostic': {'message': 'Invalid frontend origin', 'fix': 'dara dev'}}
        return state
    except (OSError, KeyError, TypeError, ValueError, ProjectError):
        return {'state': 'waiting'}


# Bounds idle upstream operations while allowing Vite's initial compilation to take time.
_PROXY_TIMEOUT = httpx.Timeout(connect=10, read=120, write=60, pool=10)
_WEBSOCKET_OPEN_TIMEOUT = 10
_WEBSOCKET_CLOSE_TIMEOUT = 2


def _proxy_url(scope: Scope, origin: str, prefix: str) -> httpx.URL:
    """Remove the ASGI mount without decoding the upstream path or its query string."""
    raw_path = scope.get('raw_path')
    if raw_path is None:
        raw_path = quote(scope['path'], safe='/').encode('ascii')
    root = scope.get('root_path', '').encode('utf-8')
    # One decoded byte can occupy either one raw byte or a three-byte percent escape.
    # Count bytes so encoded mount names and Unicode work without re-encoding the suffix.
    end = 0
    for _ in root:
        end += 3 if raw_path[end : end + 1] == b'%' else 1
    if unquote_to_bytes(raw_path[:end]) == root:
        raw_path = raw_path[end:]
    # Keep the suffix's separator too: the mount boundary itself may be encoded as %2F.
    path = quote(prefix.removesuffix('/'), safe='/').encode('ascii') + (raw_path or b'/')
    query = scope.get('query_string', b'')
    return httpx.URL(origin).copy_with(raw_path=path + (b'?' + query if query else b''))


def _proxy_headers(headers: list[tuple[bytes, bytes]], *, websocket: bool = False) -> list[tuple[bytes, bytes]]:
    """Preserve duplicate end-to-end headers while stripping connection-local fields."""
    excluded = {
        b'host',
        b'connection',
        b'upgrade',
        b'keep-alive',
        b'proxy-authenticate',
        b'proxy-authorization',
        b'te',
        b'trailer',
        b'transfer-encoding',
    }
    for key, value in headers:
        if key.lower() == b'connection':
            excluded.update(token.strip().lower() for token in value.split(b','))
    return [
        (key.lower(), value)
        for key, value in headers
        if key.lower() not in excluded and not (websocket and key.lower().startswith(b'sec-websocket-'))
    ]


def _close_status(code: int | None, reason: str = '') -> Close:
    """Translate local disconnect indicators into a close frame legal on the other connection."""
    close = Close(1000 if code == 1005 else code or 1011, reason.encode('utf-8')[:123].decode('utf-8', errors='ignore'))
    try:
        close.check()
    except ProtocolError:
        return Close(1011, 'Frontend connection interrupted')
    return close


class FrontendProxy:
    """Forward HTTP and HMR websocket traffic through the Python origin."""

    def __init__(self, root: Path, base_url: str):
        """Bind forwarding to this app's supervised frontend and public static prefix."""
        self.root = root
        self.prefix = base_url.rstrip('/') + '/static/'

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Stream frontend traffic and release both connections when either side disconnects."""
        state = frontend_status(self.root)
        if state.get('state') != 'ready':
            if scope['type'] == 'websocket':
                await send({'type': 'websocket.close', 'code': 1013})
            else:
                await HTMLResponse(
                    'Frontend preparation is pending. Open the application for diagnostics.', status_code=503
                )(scope, receive, send)
            return
        url = _proxy_url(scope, state['origin'], self.prefix)
        if scope['type'] == 'websocket':
            await self._websocket(scope, receive, send, url)
        else:
            await self._http(scope, receive, send, url)

    async def _websocket(self, scope: Scope, receive: Receive, send: Send, url: httpx.URL) -> None:
        socket = WebSocket(scope, receive, send)
        if (await socket.receive())['type'] == 'websocket.disconnect':
            return
        upstream: ClientConnection | None = None
        closing = Close(1013, 'Frontend unavailable')
        try:
            upstream = await connect(
                str(url.copy_with(scheme='ws')),
                additional_headers=[
                    (key.decode('latin-1'), value.decode('latin-1'))
                    for key, value in _proxy_headers(scope['headers'], websocket=True)
                ],
                subprotocols=scope.get('subprotocols'),
                proxy=None,
                open_timeout=_WEBSOCKET_OPEN_TIMEOUT,
                close_timeout=_WEBSOCKET_CLOSE_TIMEOUT,
                # Compiler diagnostics may be large, but must not allocate unbounded messages.
                max_size=16 * 1024 * 1024,
            )
            await socket.accept(subprotocol=upstream.subprotocol)
            async with anyio.create_task_group() as group:

                async def to_upstream():
                    nonlocal closing
                    try:
                        while True:
                            message = await socket.receive()
                            if message['type'] == 'websocket.disconnect':
                                closing = _close_status(message.get('code'), message.get('reason', ''))
                                return
                            await upstream.send(
                                message['text'] if message.get('text') is not None else message['bytes']
                            )
                    except ConnectionClosed:
                        closing = _close_status(upstream.close_code, upstream.close_reason or '')
                    except (OSError, WebSocketDisconnect):
                        closing = Close(1011, 'Browser disconnected')
                    finally:
                        group.cancel_scope.cancel()

                async def to_browser():
                    nonlocal closing
                    try:
                        async for data in upstream:
                            if isinstance(data, str):
                                await socket.send_text(data)
                            else:
                                await socket.send_bytes(data)
                        closing = _close_status(upstream.close_code, upstream.close_reason or '')
                    except ConnectionClosed:
                        closing = _close_status(upstream.close_code, upstream.close_reason or '')
                    except (OSError, WebSocketDisconnect):
                        closing = Close(1011, 'Browser disconnected')
                    finally:
                        group.cancel_scope.cancel()

                group.start_soon(to_upstream)
                group.start_soon(to_browser)
        except (OSError, InvalidHandshake, WebSocketDisconnect):
            # A refused/timed-out upgrade is a normal race during a frontend restart.
            pass
        finally:
            # One owner closes each side, outside the cancelled forwarding tasks.
            # Shield bounded cleanup even when the ASGI server cancels this request.
            if upstream is not None:
                with anyio.move_on_after(_WEBSOCKET_CLOSE_TIMEOUT + 1, shield=True):
                    await upstream.close(closing.code, closing.reason)
            if WebSocketState.DISCONNECTED not in (socket.client_state, socket.application_state):
                with (
                    anyio.move_on_after(_WEBSOCKET_CLOSE_TIMEOUT + 1, shield=True),
                    suppress(OSError, WebSocketDisconnect),
                ):
                    await socket.close(closing.code, closing.reason)

    async def _http(self, scope: Scope, receive: Receive, send: Send, url: httpx.URL) -> None:
        body_finished = anyio.Event()

        async def receive_body():
            # HTTPX's write timeout covers socket writes, not waiting for the next upload chunk.
            with anyio.fail_after(_PROXY_TIMEOUT.write):
                message = await receive()
            if message['type'] == 'http.request' and not message.get('more_body', False):
                body_finished.set()
            return message

        request = Request(scope, receive_body)
        client = httpx.AsyncClient(trust_env=False, timeout=_PROXY_TIMEOUT)
        response: httpx.Response | None = None
        stream_error: httpx.HTTPError | None = None
        try:
            async with anyio.create_task_group() as group:

                async def watch_disconnect():
                    # Only the upload reader owns receive until its last body message.
                    await body_finished.wait()
                    while (await receive())['type'] != 'http.disconnect':
                        pass
                    group.cancel_scope.cancel()

                group.start_soon(watch_disconnect)
                try:
                    try:
                        response = await client.send(
                            client.build_request(
                                request.method, url, headers=_proxy_headers(scope['headers']), content=request.stream()
                            ),
                            stream=True,
                        )
                    except TimeoutError:
                        await HTMLResponse('Frontend upload timed out.', status_code=408)(scope, receive, send)
                        return
                    except httpx.HTTPError:
                        await HTMLResponse('Frontend disconnected; waiting for recovery.', status_code=503)(
                            scope, receive, send
                        )
                        return
                    await send(
                        {
                            'type': 'http.response.start',
                            'status': response.status_code,
                            'headers': _proxy_headers(response.headers.raw),
                        }
                    )
                    async for chunk in response.aiter_raw():
                        await send({'type': 'http.response.body', 'body': chunk, 'more_body': True})
                    await send({'type': 'http.response.body', 'body': b''})
                except (ClientDisconnect, OSError):
                    pass
                except httpx.HTTPError as error:
                    # A failed stream must abort its existing response, never send a second one.
                    stream_error = error
                finally:
                    group.cancel_scope.cancel()
        finally:
            with anyio.move_on_after(5, shield=True):
                try:
                    if response is not None:
                        await response.aclose()
                finally:
                    await client.aclose()
        if stream_error is not None:
            raise stream_error


def render_frontend(request: Request, root: Path, output: Path, context: dict, development: bool):
    """Render Vite's private template or a recoverable development diagnostic page."""
    if development:
        state = frontend_status(root)
        if state.get('state') != 'ready':
            diagnostic = state.get('diagnostic', {})
            message = html.escape(diagnostic.get('message', 'Preparing the frontend project…'))
            fix = html.escape(diagnostic.get('fix', ''))
            status_url = json.dumps(context['base_url'] + '/__dara/status').replace('<', '\\u003c')
            return HTMLResponse(
                f'<!doctype html><title>Dara development</title><h1>Frontend waiting</h1><p>{message}</p><pre>{fix}</pre><script>setInterval(async()=>{{try{{const r=await fetch({status_url});if(r.ok&&(await r.json()).state==="ready")location.reload()}}catch{{}}}},1000)</script>',
                status_code=503,
            )
        directory = root / 'node_modules/.dara'
        name = 'index.dev.html'
    else:
        directory, name = output, 'index.html'
    return _templates(str(directory)).TemplateResponse(request, name, context=context)


@lru_cache(maxsize=4)
def _templates(directory: str) -> Jinja2Templates:
    """Reuse one Jinja environment per template directory instead of rebuilding it for every page request."""
    return Jinja2Templates(directory=directory)
