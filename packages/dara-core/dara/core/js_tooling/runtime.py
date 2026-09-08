"""Serve compiled frontend artifacts or proxy the supervised development runner."""

import hashlib
import html
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import anyio
import httpx
from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.templating import Jinja2Templates
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

from dara.core.js_tooling.models import FrontendManifest, ProjectError
from dara.core.js_tooling.project import read_json, workspace_root


class InputRecord(BaseModel):
    """A content fingerprint relative to a portable build input root."""

    root: str
    path: str
    hash: str
    model_config = ConfigDict(extra='forbid')


class DirectoryRecord(BaseModel):
    """A recorded directory inventory that detects additions as well as deletions."""

    root: str
    path: str
    files: list[str]
    model_config = ConfigDict(extra='forbid')


class BuildMarker(BaseModel):
    """Parse the deployed marker before using any of its paths or fingerprints."""

    schema_version: int = Field(alias='schema')
    daraVersion: str
    contract: dict[str, Any]
    contractDigest: str
    inputs: list[InputRecord]
    directories: list[DirectoryRecord]
    environment: dict[str, str]
    files: dict[str, str]
    model_config = ConfigDict(extra='forbid')


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    ).hexdigest()


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _safe_path(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root.resolve()):
        raise ProjectError('build.marker', f'Build marker path escapes its root: {relative}', 'dara build')
    return candidate


def validate_build(root: Path, manifest: FrontendManifest) -> None:
    """Verify output and available source inputs without invoking a JavaScript toolchain."""
    output = Path(manifest.out_dir)
    try:
        marker = BuildMarker.model_validate(read_json(output / '.dara-build.json'))
        if (
            marker.schema_version != 1
            or marker.daraVersion != manifest.dara_version
            or marker.contractDigest != _digest(manifest.portable())
            or marker.contractDigest != _digest(marker.contract)
        ):
            raise ValueError('Registered implementations or Dara versions changed')
        if 'index.html' not in marker.files:
            raise ValueError('Build marker has no HTML template')
        for relative, expected in marker.files.items():
            file = _safe_path(output, relative)
            if not file.is_file() or _hash(file) != expected:
                raise ValueError(f'Changed or missing output: {relative}')
        actual = sorted(
            str(p.relative_to(output)).replace(os.sep, '/')
            for p in output.rglob('*')
            if p.is_file() and p.name != '.dara-build.json'
        )
        if actual != sorted(marker.files):
            raise ValueError('The build output file inventory changed')
        workspace = workspace_root(root)
        locations = {
            'app': root,
            'workspace': workspace,
            **{f'asset:{i}': Path(asset.source) for i, asset in enumerate(manifest.static)},
            **{f'appStatic:{i}': Path(folder) for i, folder in enumerate(manifest.app_static)},
            **({'favicon': Path(manifest.favicon)} if manifest.favicon else {}),
        }
        checkout = any(
            (root / name).exists()
            for name in (
                'js',
                'package.json',
                'vite.config.ts',
                'tsconfig.json',
                'pnpm-workspace.yaml',
                'pnpm-lock.yaml',
            )
        ) or (workspace != root and (workspace / 'pnpm-lock.yaml').exists())
        for entry in marker.inputs:
            if entry.root in ('app', 'workspace') and not checkout:
                continue
            location = locations.get(entry.root)
            if not checkout and (location is None or not location.exists()):
                continue
            if location is None:
                raise ValueError(f'Missing source root: {entry.root}')
            file = _safe_path(location, entry.path)
            if not file.is_file() or _hash(file) != entry.hash:
                raise ValueError(f'Changed or missing input: {entry.root}/{entry.path}')
        for tree in marker.directories:
            if tree.root in ('app', 'workspace') and not checkout:
                continue
            location = locations.get(tree.root)
            if not checkout and (location is None or not location.exists()):
                continue
            if location is None:
                raise ValueError(f'Missing source directory: {tree.root}')
            directory = _safe_path(location, tree.path)
            files = sorted(
                str(file.relative_to(directory)).replace(os.sep, '/') for file in directory.rglob('*') if file.is_file()
            )
            if not directory.is_dir() or files != sorted(tree.files):
                raise ValueError(f'Changed input inventory: {tree.root}/{tree.path}')
        if checkout:
            for name, fingerprint in marker.environment.items():
                if _digest(os.environ.get(name)) != fingerprint:
                    raise ValueError(f'Changed build environment: {name}')
    except (ValueError, OSError, ProjectError) as exc:
        raise ProjectError('build.stale', f'{exc}; run dara build', 'dara build') from exc


class ArtifactFiles(StaticFiles):
    """Serve public output while keeping the build marker and raw Jinja template private."""

    async def get_response(self, path: str, scope):
        """Refuse private output even when accessed through a normalized alias."""
        normalized = Path(path).as_posix()
        if normalized in ('index.html', '.dara-build.json') or any(
            part.startswith('.dara') for part in Path(path).parts
        ):
            raise HTTPException(status_code=404)
        return await super().get_response(path, scope)


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


class FrontendProxy:
    """Forward HTTP and HMR websocket traffic through the Python origin."""

    def __init__(self, root: Path, base_url: str):
        self.root = root
        self.prefix = base_url.rstrip('/') + '/static/'

    async def __call__(self, scope, receive, send):
        """Stream requests and responses, preserving websocket subprotocols and close events."""
        state = frontend_status(self.root)
        if state.get('state') != 'ready':
            if scope['type'] == 'websocket':
                await send({'type': 'websocket.close', 'code': 1013})
            else:
                await HTMLResponse(
                    'Frontend preparation is pending. Open the application for diagnostics.', status_code=503
                )(scope, receive, send)
            return
        path = scope['path']
        relative = path.removeprefix(scope.get('root_path', '')).lstrip('/')
        url = state['origin'] + self.prefix + relative
        if scope.get('query_string'):
            url += '?' + scope['query_string'].decode('ascii')
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
        headers = [
            (key.decode('latin-1'), value.decode('latin-1'))
            for key, value in scope['headers']
            if key.lower() not in excluded and not key.lower().startswith(b'sec-websocket-')
        ]
        if scope['type'] == 'websocket':
            await receive()
            try:
                async with connect(
                    url.replace('http:', 'ws:', 1),
                    additional_headers=headers,
                    subprotocols=scope.get('subprotocols'),
                    proxy=None,
                    max_size=None,
                ) as upstream:
                    await send({'type': 'websocket.accept', 'subprotocol': upstream.subprotocol})
                    async with anyio.create_task_group() as group:

                        async def to_upstream():
                            while True:
                                message = await receive()
                                if message['type'] == 'websocket.disconnect':
                                    await upstream.close()
                                    group.cancel_scope.cancel()
                                    return
                                await upstream.send(
                                    message.get('text') if message.get('text') is not None else message['bytes']
                                )

                        async def to_browser():
                            try:
                                async for data in upstream:
                                    await send(
                                        {'type': 'websocket.send', 'text' if isinstance(data, str) else 'bytes': data}
                                    )
                            finally:
                                await send({'type': 'websocket.close', 'code': upstream.close_code or 1000})
                                group.cancel_scope.cancel()

                        group.start_soon(to_upstream)
                        group.start_soon(to_browser)
            except (OSError, ConnectionClosed):
                await send({'type': 'websocket.close', 'code': 1013})
        else:
            request = Request(scope, receive)
            try:
                async with (
                    httpx.AsyncClient(trust_env=False, timeout=None) as client,
                    client.stream(request.method, url, headers=headers, content=request.stream()) as response,
                ):
                    response_headers = [
                        (key, value) for key, value in response.headers.raw if key.lower() not in excluded
                    ]
                    await send(
                        {'type': 'http.response.start', 'status': response.status_code, 'headers': response_headers}
                    )
                    async for chunk in response.aiter_raw():
                        await send({'type': 'http.response.body', 'body': chunk, 'more_body': True})
                    await send({'type': 'http.response.body', 'body': b''})
            except httpx.HTTPError:
                await HTMLResponse('Frontend disconnected; waiting for recovery.', status_code=503)(
                    scope, receive, send
                )


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
    templates = Jinja2Templates(directory=str(directory))
    return templates.TemplateResponse(request, name, context=context)
