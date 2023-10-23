import json
import math
import typing

from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response
from starlette.background import BackgroundTask


class CustomResponse(Response):
    media_type = 'application/json'
    custom_encoder = {}
    custom_encoder[float] = lambda x: None if math.isnan(x) or math.isinf(x) else x

    def __init__(
        self,
        content: typing.Any,
        status_code: int = 200,
        headers: typing.Optional[typing.Dict[str, str]] = None,
        media_type: typing.Optional[str] = None,
        background: typing.Optional[BackgroundTask] = None,
    ) -> None:
        super().__init__(content, status_code, headers, media_type, background)

    def render(self, content: typing.Any) -> bytes:
        try:
            return json.dumps(
                content,
                ensure_ascii=False,
                allow_nan=False,
                indent=None,
                separators=(',', ':'),
            ).encode('utf-8')
        except ValueError:
            serialized = jsonable_encoder(content, custom_encoder=self.custom_encoder)
            return json.dumps(
                serialized,
                ensure_ascii=False,
                allow_nan=False,
                indent=None,
                separators=(',', ':'),
            ).encode('utf-8')
