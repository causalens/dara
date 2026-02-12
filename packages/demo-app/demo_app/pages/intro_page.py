from dara.components import Card, Icon, Spacer, Stack, Text
from dara.core.css import get_icon
from dara.core.visual.themes.light import Light


def italic_text(text: str):
    return Text(
        text,
        font_size='22px',
        padding='0px',
        raw_css={'font-style': 'italic'},
    )


def intro_page():
    return Stack(
        Stack(
            Card(
                Stack(
                    Stack(
                        Icon(icon=get_icon('quote-left', size='2x'), color=Light.colors.text),
                        height='12px',
                        justify='center',
                        align='start',
                    ),
                    Spacer(),
                    italic_text('A framework called Dara has taken the stage'),
                    italic_text('Helping data scientists their users engage.'),
                    italic_text('Their graphs come alive, in colors so bright,'),
                    italic_text('Turning data to stories, from morning till night.'),
                    Spacer(),
                    Stack(
                        Icon(icon=get_icon('quote-right', size='2x'), color=Light.colors.text),
                        height='12px',
                        justify='center',
                        align='end',
                    ),
                    align='center',
                    justify='center',
                ),
                accent=True,
            ),
            height='60%',
            width='70%',
            # hug=True
        ),
        justify='center',
        align='center',
    )
