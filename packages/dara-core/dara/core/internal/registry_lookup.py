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

from typing import Optional,Dict

from dara.core.internal.registry import Registry


class RegistryLookup:
    """
    Manages registry Lookup.
    """
    def __init__(self,handlers:Optional[Dict]={}):
        self.handlers = handlers

    async def get(self,registry:Registry,uid:str):
        try:
            return registry.get(uid)
        except KeyError as e:
            if registry.name in self.handlers:
                func = self.handlers[registry.name]
                entry = await func(uid)
                registry.register(uid,entry)
                return entry
            raise ValueError(
                f'Could not find uid {uid} in {registry.name} registry, did you register it before the app was initialized?'
            ).with_traceback(e.__traceback__)
