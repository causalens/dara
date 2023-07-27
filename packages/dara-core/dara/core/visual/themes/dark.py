"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from dara.core.visual.themes.definitions import (
    ThemeColors,
    ThemeDef,
    ThemeFont,
    ThemeShadows,
)

Dark = ThemeDef(
    colors=ThemeColors(
        primary='#2485E8',
        primaryHover='#4799EB',
        primaryDown='#5EA3E9',
        secondary='#BEC5EE',
        secondaryHover='#CAD0F4',
        secondaryDown='#D3D8F4',
        background='#111314',
        text='#EDEEFA',
        grey1='#32373D',
        grey2='#43474E',
        grey3='#5B5E66',
        grey4='#8D9199',
        grey5='#C3C6CF',
        grey6='#DFE2EB',
        blue1='#252A31',
        blue2='#25323F',
        blue3='#203750',
        blue4='#204368',
        violet='#5E31DC',
        turquoise='#109C41',
        purple='#D96FFF',
        teal='#00849F',
        orange='#DB6D5E',
        plum='#AB2178',
        error='#CA456F',
        errorHover='#D1567E',
        errorDown='#D7688B',
        success='#1A9FAC',
        successHover='#27A9B6',
        successDown='#34B4C0',
        warning='#C8981F',
        warningHover='#D7A526',
        warningDown='#E2B235',
        modalBg='rgba(19, 25, 35, 0.5)',
        shadowLight='rgba(0, 0, 0, 0.1)',
        shadowMedium='rgba(0, 0, 0, 0.1)',
    ),
    font=ThemeFont(size='16px'),
    shadow=ThemeShadows(light='0px 2px 4px rgba(0, 0, 0, 0.1)', medium='0px 2px 10px rgba(0, 0, 0, 0.1)'),
    themeType='dark',
)
