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

from typing import Literal

from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.interactivity.client_variable import ClientVariable


class ThemeColors(BaseModel):
    """
    Expected colors in a theme
    """

    primary: str | None = None
    primaryHover: str | None = None
    primaryDown: str | None = None
    secondary: str | None = None
    secondaryHover: str | None = None
    secondaryDown: str | None = None
    background: str | None = None
    text: str | None = None
    grey1: str | None = None
    grey2: str | None = None
    grey3: str | None = None
    grey4: str | None = None
    grey5: str | None = None
    grey6: str | None = None
    blue1: str | None = None
    blue2: str | None = None
    blue3: str | None = None
    blue4: str | None = None
    violet: str | None = None
    turquoise: str | None = None
    purple: str | None = None
    teal: str | None = None
    orange: str | None = None
    plum: str | None = None
    carrot: str | None = None
    kale: str | None = None
    chestnut: str | None = None
    error: str | None = None
    errorHover: str | None = None
    errorDown: str | None = None
    success: str | None = None
    successHover: str | None = None
    successDown: str | None = None
    warning: str | None = None
    warningHover: str | None = None
    warningDown: str | None = None
    modalBg: str | None = None
    shadowLight: str | None = None
    shadowMedium: str | None = None


class ThemeFont(BaseModel):
    """
    Expected font options in a theme
    """

    size: str | None = None


class ThemeShadows(BaseModel):
    """
    Expected shadow options in a theme
    """

    light: str | None = None
    medium: str | None = None


class ThemeDef(BaseModel):
    """
    Defines the theme schema
    """

    colors: ThemeColors | None = None
    font: ThemeFont | None = None
    shadow: ThemeShadows | None = None
    themeType: Literal['light'] | Literal['dark'] | None = None


class BaseTheme(BaseModel):
    """
    Defines the base theming scheme of an app
    """

    main: ThemeDef | ClientVariable | Literal['light'] | Literal['dark']
    base: Literal['light'] | Literal['dark'] | None = None
