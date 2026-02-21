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

from fastapi import Request

from dara.core.auth.definitions import SESSION_TOKEN_COOKIE_NAME


async def ensure_authorization_header_from_session_cookie(request: Request, call_next):
    """
    Inject a Bearer Authorization header from the session cookie when missing.

    This preserves compatibility for downstream handlers/plugins that still inspect
    Authorization headers explicitly while Dara transitions to cookie-first auth.
    """
    if request.headers.get('Authorization') is None:
        session_token = request.cookies.get(SESSION_TOKEN_COOKIE_NAME)
        if session_token is not None:
            # mutate raw scope headers so downstream request.header lookups can see it
            headers = list(request.scope['headers'])
            headers.append((b'authorization', f'Bearer {session_token}'.encode()))
            request.scope['headers'] = headers

    return await call_next(request)
