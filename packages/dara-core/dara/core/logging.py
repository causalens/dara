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

import json
import logging
import sys
import time
import traceback
from typing import Any, Dict, Optional, Union

import colorama
from colorama import Back, Fore
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import Message

colorama.init()

JsonSerializable = Union[str, int, float, dict, None]

one_mb = int(1024 * 1024)


class Logger:
    """Custom Logger class for writing JSON formatted log messages"""

    def __init__(self, name: str):
        self.name = name
        self._logger = logging.getLogger(f'dara.{name}')

    def getLevel(self) -> int:
        """
        Get effective level of the logger
        """
        return self._logger.getEffectiveLevel()

    def info(self, title: str, extra: Optional[Dict[str, Any]] = None):
        """
        Log a message at the INFO level

        :param title: short title for the log message
        :param extra: an optional field for any extra info to be passed along
        """
        payload: Dict[str, JsonSerializable] = {
            'title': title,
        }
        self._logger.info(payload, extra={'content': extra})

    def warning(self, title: str, extra: Optional[Dict[str, Any]] = None):
        """
        Log a message at the WARNING level

        :param title: short title for the log message
        :param extra: an optional field for any extra info to be passed along
        """
        payload: Dict[str, JsonSerializable] = {
            'title': title,
        }

        self._logger.warning(payload, extra={'content': extra})

    def error(self, title: str, error: BaseException, extra: Optional[Dict[str, Any]] = None):
        """
        Log a message at the ERROR level

        :param title: short title for the log message
        :param error: the actual error object to print in dev mode
        :param extra: an optional field for any extra info to be passed along
        """
        payload = {'title': title, 'error': error}

        self._logger.error(payload, extra={'content': extra})

    def debug(self, title: str, description: Optional[str] = None, extra: Optional[Dict[str, Any]] = None):
        """
        Log a message at the DEBUG level

        :param title: short title for the log message
        :param description: an optional longer description for what this debug message is for
        :param extra: an optional field for any extra info to be passed along
        """
        # Extract the traceback so we can add the line where this debug message was from
        frame_summary = traceback.extract_stack()[-2]

        payload: Dict[str, JsonSerializable] = {
            'filename': frame_summary.filename,
            'func_name': frame_summary.name,
            'lineno': frame_summary.lineno,
            'title': title,
        }
        if description is not None:
            payload['description'] = description

        self._logger.debug(payload, extra={'content': extra})


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    A Simple HTTP Middleware for Starlette based services

    Usage:

    >>> logger = Logger('name')
    >>> app.add_middleware(LoggingMiddleware, logger=logger)
    """

    request_log_template = '%s:%s - %s %s'

    def __init__(self, app, logger: Logger):
        self.logger = logger
        super().__init__(app)

    async def dispatch(self, request, call_next):
        host = request.client.host if request.client is not None else 'unknown'
        port = request.client.port if request.client is not None else 'unknown'
        title = self.request_log_template % (host, port, request.method, request.url.path)

        if self.logger.getLevel() <= logging.DEBUG:
            content_length = int(request.headers.get('Content-Length', 0))
            # This is required so that requesting the body content doesn't hang the request
            if request.headers.get('Content-Type') == 'application/json' and content_length < one_mb:
                old_recieve = request._receive

                # Add the debug logging into a new receive call that wraps the old one. This is required to make
                # streaming requests and responses work as streaming sends further messages to trigger
                # sending/receiving further data
                async def receive() -> Message:
                    content = await old_recieve()
                    self.logger.debug(title, 'REQUEST_RECEIVED', dict(content))
                    return content

                request._receive = receive
            else:
                content = {'request_body_size': content_length}
                self.logger.debug(title, 'REQUEST_RECEIVED', content)

        start_time = time.time()
        try:
            response = await call_next(request)
        except RequestValidationError as exc:
            raise exc
        except HTTPException as exc:
            raise exc
        except Exception as exc:
            self.logger.error(f'{title} - Uncaught Error', exc)
            raise exc

        if self.logger.getLevel() <= logging.DEBUG:
            self.logger.debug(
                title, 'RESPONSE_SENT', {'status': response.status_code, 'process_time': time.time() - start_time}
            )
        elif self.logger.getLevel() <= logging.INFO:
            # In info mode, we log in a shorter format, similar to default uvicorn default http logs
            self.logger.info(f'{title} {response.status_code}')

        return response


def _print_stacktrace(err: Optional[BaseException] = None) -> str:
    """
    Prints out the current stack trace whilst unwinding all the logging calls on the way so it just shows the relevant
    parts. Will also extract any exceptions and print them at the end.
    """
    if err is not None:
        return ''.join(traceback.format_exception(type(err), err, err.__traceback__))

    exc = sys.exc_info()[0]
    stack = traceback.extract_stack()[:-1]
    if exc is not None:
        del stack[-1]

    # Unwind the stack trace back to before the logging process started
    stack_length = len(stack)
    for _i in range(stack_length):
        if stack[-1].filename != __file__:
            stack.pop()
        else:
            stack.pop()
            break

    trc = 'Traceback (most recent call last):\n'
    stackstr = trc + ''.join(traceback.format_list(stack))
    if exc is not None:
        stackstr += '  ' + traceback.format_exc().lstrip(trc)
    return stackstr


class DaraProdFormatter(logging.Formatter):
    """
    A Logging Formatter for production purposes, it prints the whole log messages as json strings, including timestamps
    and log levels.
    """

    @staticmethod
    def _get_payload(record: logging.LogRecord) -> Dict[str, JsonSerializable]:
        timestamp = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(record.created)) + '.%s' % int(record.msecs)
        if isinstance(record.msg, dict):
            payload: Dict[str, JsonSerializable] = {
                'timestamp': timestamp,
                'level': record.levelno,
                'name': record.name,
                **record.msg,
            }

            if record.levelname == 'ERROR':
                err = payload.pop('error')
                payload['error'] = str(err)
                payload['stacktrace'] = _print_stacktrace(err if isinstance(err, BaseException) else None)

            return payload

        payload = {
            'timestamp': timestamp,
            'level': record.levelno,
            'name': record.name,
            'message': record.getMessage(),
        }

        return payload

    def format(self, record: logging.LogRecord):
        payload = self._get_payload(record)
        return json.dumps(payload)


class DaraDevFormatter(logging.Formatter):
    """
    A Logging Formatter for development purposes, it prettifies the JSON based logs into some readable.

    This should not be used in production as there is a performance penalty associated with it.
    """

    base_message_template = f'{Back.BLUE} %s %s %s {Back.MAGENTA} %s {Back.RESET} %s {Fore.RESET}'
    extra_template = '\r\n%s %s'
    message_end = f'{Fore.RESET}{Back.RESET}'

    level_to_color_map = {
        'DEBUG': (Back.WHITE, Fore.RESET),
        'ERROR': (Back.RED, Fore.RED),
        'INFO': (Back.GREEN, Fore.GREEN),
        'WARNING': (Back.YELLOW, Fore.YELLOW),
    }
    default_color = (Back.GREEN, Fore.GREEN)

    def format(self, record: logging.LogRecord):
        colors = self.level_to_color_map.get(record.levelname, self.default_color)
        if isinstance(record.msg, dict):
            payload = {**record.msg}
            fmt_time = self.formatTime(record, self.datefmt)
            spacer = ' ' * 4
            base_msg = self.base_message_template % (
                fmt_time,
                colors[0],
                record.levelname,
                record.name,
                payload['title'],
            )

            if record.levelname == 'INFO':
                content = ''
                if record.__dict__.get('content'):
                    content = '\r\n' + self.extra_template % (spacer, record.__dict__['content']) + '\r\n'
                return base_msg + content + self.message_end

            if record.levelname == 'WARNING':
                content = ''
                if record.__dict__.get('content'):
                    content = '\r\n' + self.extra_template % (spacer, record.__dict__['content']) + '\r\n'
                return base_msg + content + self.message_end

            if record.levelname == 'ERROR':
                error = ''
                if err := payload.get('error'):
                    error = _print_stacktrace(err if isinstance(err, BaseException) else None)
                content = base_msg
                if record.__dict__.get('content'):
                    content = content + '\r\n' + self.extra_template % (spacer, record.__dict__['content'])
                return content + '\r\n\r\n' + error + self.message_end

            if record.levelname == 'DEBUG':
                file_details = self.extra_template % (
                    spacer,
                    f'File: {payload["filename"]}, line {payload["lineno"]} in {payload["func_name"]}',
                )
                content = ''
                if record.__dict__.get('content'):
                    content = self.extra_template % (spacer, f'Content: {record.__dict__["content"]}')
                description = ''
                if payload.get('description'):
                    description = self.extra_template % (spacer, f'Description: {payload["description"]}')
                return base_msg + '\r\n' + file_details + description + content + '\r\n' + self.message_end

        return self.base_message_template % (
            self.formatTime(record, self.datefmt),
            colors[0],
            record.levelname,
            record.name,
            record.getMessage(),
        )


eng_logger = Logger('eng')
""" Logger for engineers working on Dara itself, for debugging purposes.

Production: disabled
Dev: disabled
Enabled explicitly with `--debug=<LEVEL>` cli flag.

Level guidelines:
ERROR - engineering descriptions of internal errors, logging root causes of errors in internals; example: 'Failed to cancel task'
WARNING - internal warnings, something is potentially wrong, wrong parameter type provided??
INFO - logs describing i.e. starting steps of DerivedVariable resolving, example: 'Derived variable X '
DEBUG - very detailed logs, example: logs along the whole way of i.e. DerivedVariable lifecycle, task system
"""

dev_logger = Logger('dev')
"""
Logger for developers working on applications.

Production: enabled with `level=INFO`
Dev: enabled with `level=DEBUG`

Level guidelines:
ERROR - user-understandable errors, explaining how to fix them if possible; usually logging on the top-level, close to the API surface;
    example: "Could not find action X, did you forget to register it?"
WARNING - warnings users should be aware of, that aren't part of the normal app flow;
    example: "env file not found, generating a default one"
INFO - things happening user should be aware of which are part of the normal application flow, shouldn't print any user data;
    example: "Rebuilding JS"
DEBUG - like INFO but only things useful for debugging, can include user data;
    example: "Rebuilding because of X and Y flags", "Running py_component X with data Y", "...returning a task"
"""

http_logger = Logger('http')
"""
Logger for HTTP requests.

Shows detailed request/response logs on DEBUG, and basic logs on INFO.
"""
