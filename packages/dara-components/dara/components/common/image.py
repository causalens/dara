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

from pydantic import field_validator

from dara.components.common.base_component import ContentComponent


class Image(ContentComponent):
    """
    ![Image](../../../../docs/packages/dara-components/common/assets/Image.png)

    An Image Component for adding image files to your document.

    Accepts a single parameter `src` that should be a URL pointing to a local or remote image.
    Local URLs should be provided in the format of `/static/path_to_image.extension`

    An Image component can be rendered like:

    ```python
    from dara.core import ConfigurationBuilder()
    from dara.components.common import Image

    config = ConfigurationBuilder()

    # Local image located in ./static/image.test.png
    Image(
        src='/static/image.test.png'
    )

    # Local image located in a different static folder - ./custom_statics/image.gif
    # `add_static_folder` merges statics from the specified folder with `./static`
    config.add_static_folder('./custom_statics')

    Image(src='/static/image.gif')

    # Remote image
    Image(src='https://example.com/some_image.png')
    ```

    :param src: The URL to the local or remote image
    """

    src: str

    @field_validator('src')
    @classmethod
    def validate_src(cls, value: str):
        if not value.startswith('/static/') and not value.startswith('http'):
            raise ValueError(
                f'Invalid image URL found "{value}"'
                'URL must be in the format of /static/image/path.extension for images located in the ./static folder or '
                'another static folder registered with config.add_static_folder; or http for remote images.'
            )

        return value
