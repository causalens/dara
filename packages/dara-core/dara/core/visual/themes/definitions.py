"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Literal, Optional, Union

from pydantic import BaseModel


class ThemeColors(BaseModel):
    """
    Expected colors in a theme
    """

    primary: Optional[str] = None
    primaryHover: Optional[str] = None
    primaryDown: Optional[str] = None
    secondary: Optional[str] = None
    secondaryHover: Optional[str] = None
    secondaryDown: Optional[str] = None
    background: Optional[str] = None
    text: Optional[str] = None
    grey1: Optional[str] = None
    grey2: Optional[str] = None
    grey3: Optional[str] = None
    grey4: Optional[str] = None
    grey5: Optional[str] = None
    grey6: Optional[str] = None
    blue1: Optional[str] = None
    blue2: Optional[str] = None
    blue3: Optional[str] = None
    blue4: Optional[str] = None
    violet: Optional[str] = None
    turquoise: Optional[str] = None
    purple: Optional[str] = None
    teal: Optional[str] = None
    orange: Optional[str] = None
    plum: Optional[str] = None
    error: Optional[str] = None
    errorHover: Optional[str] = None
    errorDown: Optional[str] = None
    success: Optional[str] = None
    successHover: Optional[str] = None
    successDown: Optional[str] = None
    warning: Optional[str] = None
    warningHover: Optional[str] = None
    warningDown: Optional[str] = None
    modalBg: Optional[str] = None
    shadowLight: Optional[str] = None
    shadowMedium: Optional[str] = None


class ThemeFont(BaseModel):
    """
    Expected font options in a theme
    """

    size: Optional[str] = None


class ThemeShadows(BaseModel):
    """
    Expected shadow options in a theme
    """

    light: Optional[str] = None
    medium: Optional[str] = None


class ThemeDef(BaseModel):
    """
    Defines the theme schema
    """

    colors: Optional[ThemeColors] = None
    font: Optional[ThemeFont] = None
    shadow: Optional[ThemeShadows] = None
    themeType: Optional[Union[Literal['light'], Literal['dark']]] = None


class BaseTheme(BaseModel):
    """
    Defines the base theming scheme of an app
    """

    main: Union[ThemeDef, Literal['light'], Literal['dark']]
    base: Optional[Union[Literal['light'], Literal['dark']]] = None
