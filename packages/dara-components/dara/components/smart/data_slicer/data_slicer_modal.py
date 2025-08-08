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

from typing import Union

from pandas import DataFrame

from dara.components.common import Button, Heading, Modal, Stack
from dara.components.smart.data_slicer.data_slicer import DataSlicer
from dara.components.smart.data_slicer.extension.filter_status_button import (
    FilterStatusButton,
)
from dara.components.smart.data_slicer.utils.core import get_filter_stats
from dara.core.actions import UpdateVariable
from dara.core.definitions import ComponentInstance, discover
from dara.core.interactivity import AnyDataVariable, DerivedVariable, Variable


def toggle_variable(ctx: UpdateVariable.Ctx):  # type: ignore
    return not ctx.inputs.old


def increment(ctx: UpdateVariable.Ctx):  # type: ignore
    return ctx.inputs.old + 1


@discover
class DataSlicerModal(DataSlicer):
    def __init__(
        self,
        data: Union[DataFrame, AnyDataVariable],
        rows_to_show: int = 10,
        button_top_position: str = '5%',
    ):
        """
        DataSlicerModal component is a modal version of the DataSlicer component.

        Once instantiated, the `DerivedVariable` returned by `get_output()` will contain the filtered data.

        When included in a page, it adds a Filter button to the top-right corner of the screen which
        displays current filter status when hovered. The button opens up a modal with the DataSlicer when clicked.

        :param data: input data
        :param rows_to_show: number of rows to show in the 'Head' and 'Tail' sections of filter preview
        :param button_top_position: optional override of the filter button 'top' absolute position property
        """
        super().__init__(data, rows_to_show)

        self.show_filters = Variable(False)
        self.filter_stats = DerivedVariable(
            get_filter_stats, variables=[self.data_var, self.final_output, self.final_filters]
        )
        self.button_top_position = button_top_position

    def modal_content(self) -> ComponentInstance:
        return Stack(
            Stack(
                Heading('Data Slicer', raw_css={'padding': '0 1rem'}),
                self.content(),
                height='95%',
            ),
            Stack(
                Button('Close', onclick=UpdateVariable(toggle_variable, variable=self.show_filters)),
                Button(
                    'Apply',
                    onclick=[
                        self.update_output_action,
                        UpdateVariable(toggle_variable, variable=self.show_filters),
                    ],
                ),
                justify='flex-end',
                direction='horizontal',
                padding='0 1rem',
                height='5%',
            ),
            justify='space-between',
            raw_css={'gap': '0px'},
        )

    def filter_button(self) -> ComponentInstance:
        return FilterStatusButton(
            filter_stats=self.filter_stats,
            on_click=UpdateVariable(toggle_variable, variable=self.show_filters),
            top_position=self.button_top_position,
        )

    def __call__(self) -> ComponentInstance:
        return Stack(
            self.filter_button(),
            Modal(
                self.modal_content(),
                show=self.show_filters,
                height='100%',
                max_width='90vw',
                raw_css={'max-height': '90vh'},
            ),
            # Forcing the stack to not take any space, since both button and modal are portals
            height='0px',
            width='0px',
            raw_css={'flex': 'none'},
        )
