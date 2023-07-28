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

from dara.core.visual.themes.definitions import (
    ThemeColors,
    ThemeDef,
    ThemeFont,
    ThemeShadows,
)

Light = ThemeDef(
    colors=ThemeColors(
        primary='#3796F6',
        primaryHover='#0079D4',
        primaryDown='#0060AA',
        secondary='#434B87',
        secondaryHover='#4E568E',
        secondaryDown='#5A629C',
        background='#F8F9FF',
        text='#1E244D',
        grey1='#EEF1FA',
        grey2='#DFE2EB',
        grey3='#C3C6CF',
        grey4='#8D9199',
        grey5='#5B5E66',
        grey6='#43474E',
        blue1='#FBFCFF',
        blue2='#ECF2FD',
        blue3='#E1EEFD',
        blue4='#C4DFFC',
        violet='#5E62E2',
        turquoise='#2CB85C',
        purple='#E28FFF',
        teal='#0790AE',
        orange='#FF8F80',
        plum='#BA3C8B',
        error='#DA6087',
        errorHover='#D14975',
        errorDown='#C33462',
        success='#2DB3BF',
        successHover='#1CA6B2',
        successDown='#149AA7',
        warning='#DCB016',
        warningHover='#D0A406',
        warningDown='#C39800',
        modalBg='rgba(19, 25, 35, 0.5)',
        shadowLight='rgba(0, 0, 0, 0.1)',
        shadowMedium='rgba(0, 0, 0, 0.1)',
    ),
    font=ThemeFont(size='16px'),
    shadow=ThemeShadows(light='0px 2px 4px rgba(0, 0, 0, 0.1)', medium='0px 2px 10px rgba(0, 0, 0, 0.1)'),
    themeType='light',
)
