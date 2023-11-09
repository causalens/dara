from typing import List

from {{cookiecutter.__package_name}}.utils.components import (
    accordion,
    anchor,
    bokeh,
    bullet_list,
    button,
    button_bar,
    card,
    carousel,
    causal_graph_viewer,
    causal_graph_viewer_planar,
    checkbox_group,
    code,
    component_select_list,
    datepicker,
    edge_encoder,
    form,
    grid,
    heading,
    html_raw,
    icon,
    image,
    input,
    label,
    markdown,
    matplotlib,
    modal,
    node_hierarchy_builder,
    overlay,
    paragraph,
    plotly,
    progress_bar,
    radio_group,
    seaborn,
    select,
    slider,
    spacer,
    stack,
    switch,
    tabbed_card,
    table,
    text,
    textarea,
    tooltip,
)

from dara.components import Button, Card, Heading, Label, Select, Spacer, Stack, Text
from dara.core import ComponentInstance, Variable, py_component

dara_graphs_map = {
    'CausalGraphViewer': causal_graph_viewer,
    'CausalGraphViewer (Planar Layout)': causal_graph_viewer_planar,
    'EdgeEncoder': edge_encoder,
    'NodeHierarchyBuilder': node_hierarchy_builder,
}

dara_plotting_map = {
    'Bokeh': bokeh,
    'Matplotlib': matplotlib,
    'Plotly': plotly,
    'Seaborn': seaborn,
}

dara_components_map = {
    'Accordion': accordion,
    'Anchor': anchor,
    'Button': button,
    'BulletList': bullet_list,
    'ButtonBar': button_bar,
    'Card': card,
    'Carousel': carousel,
    'CheckboxGroup': checkbox_group,
    'Code': code,
    'ComponentSelectList': component_select_list,
    'Datepicker': datepicker,
    'Form': form,
    'Grid': grid,
    'Heading': heading,
    'HtmlRaw': html_raw,
    'Icon': icon,
    'Image': image,
    'Input': input,
    'Label': label,
    'Markdown': markdown,
    'Modal': modal,
    'Overlay': overlay,
    'Paragraph': paragraph,
    'ProgressBar': progress_bar,
    'RadioGroup': radio_group,
    'Select': select,
    'Slider': slider,
    'Spacer': spacer,
    'Stack': stack,
    'Switch': switch,
    'TabbedCard': tabbed_card,
    'Table': table,
    'Text': text,
    'Textarea': textarea,
    'Tooltip': tooltip,
}

dara_graphs = list(dara_graphs_map.keys())
dara_plotting = list(dara_plotting_map.keys())
dara_components = list(dara_components_map.keys())

all_dara_components = dara_graphs + dara_plotting + dara_components

select_var = Variable([])


def component_card(name: str, content: ComponentInstance) -> ComponentInstance:
    return Card(content, title=name)


def component_solo(name: str, content: ComponentInstance) -> ComponentInstance:
    return Stack(Heading(name, level=3, padding='0 1rem'), content)

def italic_text(text: str):
    return Text(
        text,
        padding='0px',
        raw_css={'font-style': 'italic'},
    )

@py_component
def components_to_show(select_val: List) -> ComponentInstance:
    components = Stack()

    # show all components if none selected 
    show_components = select_val
    if len(select_val) == 0:
        show_components = all_dara_components

    if set(show_components).intersection(dara_graphs):
        components.append(Spacer())
        components.append(Heading('Graph Components', level=2))
        for graph in show_components:
            if graph in dara_graphs:
                components.append(component_card(graph, dara_graphs_map[graph]()))
    
    if set(show_components).intersection(dara_plotting):
        components.append(Spacer())
        components.append(Heading('Plotting Components', level=2))
        for plot in show_components:
            if plot in dara_plotting:
                components.append(component_card(plot, dara_plotting_map[plot]()))
    
    if set(show_components).intersection(dara_components):
        components.append(Spacer())
        components.append(Heading('Common Components', level=2))
        for component in show_components:
            if component in dara_components:
                if component in ['Card', 'TabbedCard']:
                    components.append(component_solo(component, dara_components_map[component]()))
                else:
                    components.append(component_card(component, dara_components_map[component]()))
        
    return components


def components_page() -> ComponentInstance:
    return Stack(
        Stack(
            Heading('A-Z Components'),
            Label(
                Select(
                    value=select_var,
                    items=all_dara_components,
                    multiselect=True,
                ),
                value='Select component(s) to show:',
            ),
            Stack(
                Button('Show all', outline=True, onclick=select_var.update(value=all_dara_components)),
                Button('Clear', outline=True, onclick=select_var.update(value=[])),
                direction='horizontal',
            ),
            hug=True
        ),
        Spacer(line=True),
        components_to_show(select_var),
    )