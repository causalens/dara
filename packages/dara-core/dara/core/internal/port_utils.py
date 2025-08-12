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

import socket


def is_available(host: str, port: int) -> bool:
    """
    Check if a given (host, port) pair is available (i.e. there could be another server running already)

    :param host: host to test
    :param port: port to test
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(2.0)  # timeout in case port is blocked
            return sock.connect_ex((host, port)) != 0
    except BaseException:
        return False


def find_available_port(host: str, from_port: int, to_port: int):
    """
    Search the specified (from, to) port space to find an available one

    Raises if no port is available

    :param host: host
    :param from_port: port to start search from
    :param to_port: port to finish search on
    """
    increment = 1 if to_port > from_port else -1
    for port in range(from_port, to_port, increment):
        if is_available(host, port):
            return port

    raise ConnectionError(f'Could not find an available port in specified range [{from_port}, {to_port}]')
