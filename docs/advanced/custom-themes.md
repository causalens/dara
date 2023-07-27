---
title: Custom Themes
---

## Writing Your Own Theme

To create your own theme you will need to create a new `dara.core.visual.themes.definitions.ThemeDef` variable. `ThemeDef` can be imported from `dara.core.visual.themes.definitions`.

You can use a custom theme either by providing all of the theme fields, or alternatively you can define a base theme which will be used for any
fields that you do not wish to provide. Example usage:

```python
from dara.core.visual.themes.definitions import ThemeColors, ThemeDef
from dara.core import ConfigurationBuilder

config = ConfigurationBuilder()
config.set_theme(
    main_theme=ThemeDef(colors=ThemeColors(secondary='blue')),
    base_theme='dark'
)
```

If you want to change all of the colors in the theme you can use the following example:

```python
from dara.core import ConfigurationBuilder

from dara.core.visual.themes.definitions import ThemeColors, ThemeDef, ThemeFont, ThemeShadows

PurpleTheme = ThemeDef(
    colors=ThemeColors(
        primary='#914470',
        primaryHover='#782B57',
        primaryDown='#5E113D',
        secondary='#82536e',
        secondaryHover='#FFF',
        secondaryDown='#E0E3E8',
        background='#FFF',
        text='#3F4154',
        grey1='#FAFAFF',
        grey2='#EEEFF6',
        grey3='#DADCE8',
        grey4='#BDBFD8',
        grey5='#9A9CB1',
        grey6='#6A6D83',
        blue1='#FDFBFF',
        blue2='#EEEAFE',
        blue3='#E4DDFF',
        blue4='#D4C9FF',
        violet='#5E62E2',
        turquoise='#64D3D2',
        purple='#DC7AFF',
        teal='#009FC2',
        orange='#FF9C6A',
        plum='#BD4691',
        error='#DA6087',
        errorHover='#D14975',
        errorDown='#C33462',
        success='#4f9a5c',
        successHover='#368143',
        successDown='#1C6729',
        warning='#dba11c',
        warningHover='#c28803',
        warningDown='#A86E00',
        modalBg='#13192380',
        shadowLight='#36486711',
        shadowMedium='#36486723',
    ),
    font=ThemeFont(size='12px'),
    shadow=ThemeShadows(light='2px 2px 4px 0 #36486711', medium='2px 2px 4px 0 #36486723'),
    themeType='light',
)


config = ConfigurationBuilder()

config.set_theme(main_theme=PurpleTheme)
```