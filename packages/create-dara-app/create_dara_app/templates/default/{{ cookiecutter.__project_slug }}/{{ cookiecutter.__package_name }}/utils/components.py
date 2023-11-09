import math

import matplotlib.tri as tri
import numpy
import plotly.express as px
import plotly.graph_objects as go
import seaborn as sns
from bokeh.plotting import figure
from cai_causal_graph import CausalGraph
from matplotlib.figure import Figure
from pandas import DataFrame
from scipy.integrate import odeint

from dara.components import (
    Accordion,
    AccordionItem,
    Anchor,
    Bokeh,
    BulletList,
    Button,
    ButtonBar,
    ButtonStyle,
    Card,
    Carousel,
    CarouselItem,
    CausalGraphViewer,
    CheckboxGroup,
    Code,
    ComponentSelectList,
    Datepicker,
    Form,
    FormPage,
    Grid,
    Heading,
    HtmlRaw,
    Icon,
    Image,
    Input,
    Item,
    ItemBadge,
    Label,
    Markdown,
    Matplotlib,
    Modal,
    NodeHierarchyBuilder,
    Overlay,
    Paragraph,
    Plotly,
    ProgressBar,
    RadioGroup,
    Select,
    Slider,
    Spacer,
    Stack,
    Switch,
    Tab,
    TabbedCard,
    Table,
    Text,
    Textarea,
    Tooltip,
    VisualEdgeEncoder,
)
from dara.components.common.component_select_list import ComponentItem
from dara.components.graphs.components.edge_encoder import (
    EdgeConstraint,
    EdgeConstraintType,
)
from dara.components.graphs.graph_layout import PlanarLayout, SpringLayout
from dara.components.plotting.palettes import PolarisingLight11
from dara.core import ComponentInstance, DataVariable, Variable, py_component
from dara.core.css import get_icon
from dara.core.visual.themes.light import Light

form_value = Variable({})
show_modal = Variable(False)
show_overlay = Variable(True)
rate_value = Variable(7)
data = DataVariable(
    DataFrame(
        [
            {
                'col1': 'a',
                'col2': 1,
                'col3': 'F',
                'col4': '1990-02-12T00:00:00.000Z',
            },
            {
                'col1': 'b',
                'col2': 2,
                'col3': 'M',
                'col4': '1991-02-12T00:00:00.000Z',
            },
            {
                'col1': 'c',
                'col2': 3,
                'col3': 'M',
                'col4': '1991-02-12T00:00:00.000Z',
            },
            {
                'col1': 'd',
                'col2': 4,
                'col3': 'F',
                'col4': '1994-02-07T00:00:00.000Z',
            },
            {
                'col1': 'abc',
                'col2': 4,
                'col3': 'M',
                'col4': '1993-12-12T00:00:00.000Z',
            },
        ]
    )
)


@py_component
def show_var(text: str, value):
    return Stack(Text(text, bold=True), Text(str(value)), direction='horizontal')


def show_code(variable: Variable, code: str, component_type: str, component_name: str) -> ComponentInstance:
    return Stack(
        Button('Show Source Code', onclick=variable.update(value=True), width='200px', styling=ButtonStyle.GHOST),
        Modal(
            Stack(Code(code=code, theme=Code.Themes.LIGHT), scroll=True),
            Stack(
                Button(
                    'Close',
                    onclick=variable.update(value=False),
                    width='200px',
                    styling=ButtonStyle.ERROR,
                ),
                align='end',
                justify='end',
                hug=True,
            ),
            show=variable,
            height='700px',
            width='1000px',
            raw_css={'overflow-x': 'auto'},
        ),
        Anchor(
            'Check the docs for more info',
            href=f'https://dara.causalens.com/docs/generated/dara/reference/dara/components/{component_type}/{component_name}/',
            new_tab=True,
        ),
        height='auto',
    )


# --------------------------------------------------------------------------------
# Graph Components
# --------------------------------------------------------------------------------

causal_graph_var = Variable(False)


def causal_graph_viewer() -> ComponentInstance:

    causal_graph = CausalGraph()
    causal_graph.add_edge('Age', 'Fraud')
    causal_graph.add_edge('Authority Contacted', 'Fraud')
    causal_graph.add_edge('CPI', 'Salary')
    causal_graph.add_edge('Car Value', 'Fraud')
    causal_graph.add_edge('Crime Rate', 'Fraud')
    causal_graph.add_edge('Education Level', 'Fraud')
    causal_graph.add_edge('Education Level', 'Occupation')
    causal_graph.add_edge('Education Level', 'Salary')
    causal_graph.add_edge('Location', 'Crime Rate')
    causal_graph.add_edge('Marital Status', 'Fraud')
    causal_graph.add_edge('Occupation', 'Salary')
    causal_graph.add_edge('Previous Claims', 'Fraud')
    causal_graph.add_edge('Salary', 'Car Value')
    causal_graph.add_edge('Salary', 'Fraud')
    causal_graph.add_edge('Total Claim', 'Fraud')
    causal_graph.add_edge('Unemployment Rate', 'Salary')

    for node in causal_graph.nodes:
        node.meta.update({'rendering_properties': {'color': numpy.random.choice(PolarisingLight11)}})

    return Stack(
        CausalGraphViewer(
            causal_graph=causal_graph,
        ),
        show_code(
            causal_graph_var,
            """
causal_graph = CausalGraph()
causal_graph.add_edge('Age', 'Fraud')
causal_graph.add_edge('Authority Contacted','Fraud')
causal_graph.add_edge('CPI','Salary')
causal_graph.add_edge('Car Value','Fraud')
causal_graph.add_edge('Crime Rate','Fraud')
causal_graph.add_edge('Education Level','Fraud')
causal_graph.add_edge('Education Level','Occupation')
causal_graph.add_edge('Education Level','Salary')
causal_graph.add_edge('Location','Crime Rate')
causal_graph.add_edge('Marital Status','Fraud')
causal_graph.add_edge('Occupation','Salary')
causal_graph.add_edge('Salary','Car Value')
causal_graph.add_edge('Salary','Fraud')
causal_graph.add_edge('Total Claim','Fraud')
causal_graph.add_edge('Unemployment Rate','Salary')


for node in causal_graph.nodes:
    node.meta.update({'rendering_properties': {'color': numpy.random.choice(PolarisingLight11)}})

CausalGraphViewer(
    causal_graph=causal_graph,
)
        """,
            'graphs/components',
            'causal_graph_viewer',
        ),
        height='700px',
    )


def causal_graph_viewer_planar() -> ComponentInstance:

    causal_graph = CausalGraph()
    causal_graph.add_edge('Age', 'Fraud')
    causal_graph.add_edge('Authority Contacted', 'Fraud')
    causal_graph.add_edge('CPI', 'Salary')
    causal_graph.add_edge('Car Value', 'Fraud')
    causal_graph.add_edge('Crime Rate', 'Fraud')
    causal_graph.add_edge('Education Level', 'Fraud')
    causal_graph.add_edge('Education Level', 'Occupation')
    causal_graph.add_edge('Education Level', 'Salary')
    causal_graph.add_edge('Location', 'Crime Rate')
    causal_graph.add_edge('Marital Status', 'Fraud')
    causal_graph.add_edge('Occupation', 'Salary')
    causal_graph.add_edge('Previous Claims', 'Fraud')
    causal_graph.add_edge('Salary', 'Car Value')
    causal_graph.add_edge('Salary', 'Fraud')
    causal_graph.add_edge('Total Claim', 'Fraud')
    causal_graph.add_edge('Unemployment Rate', 'Salary')

    return Stack(
        CausalGraphViewer(
            causal_graph=causal_graph,
            graph_layout=PlanarLayout(),
        ),
        show_code(
            causal_graph_var,
            """
causal_graph = CausalGraph()
causal_graph.add_edge('Age', 'Fraud')
causal_graph.add_edge('Authority Contacted','Fraud')
causal_graph.add_edge('CPI','Salary')
causal_graph.add_edge('Car Value','Fraud')
causal_graph.add_edge('Crime Rate','Fraud')
causal_graph.add_edge('Education Level','Fraud')
causal_graph.add_edge('Education Level','Occupation')
causal_graph.add_edge('Education Level','Salary')
causal_graph.add_edge('Location','Crime Rate')
causal_graph.add_edge('Marital Status','Fraud')
causal_graph.add_edge('Occupation','Salary')
causal_graph.add_edge('Salary','Car Value')
causal_graph.add_edge('Salary','Fraud')
causal_graph.add_edge('Total Claim','Fraud')
causal_graph.add_edge('Unemployment Rate','Salary')


for node in causal_graph.nodes:
    node.meta.update({'rendering_properties': {'color': numpy.random.choice(PolarisingLight11)}})

CausalGraphViewer(
    causal_graph=causal_graph,
    graph_layout=PlanarLayout(),
)
        """,
            'graphs/components',
            'causal_graph_viewer',
        ),
        height='700px',
    )


edge_encoder_var = Variable(False)


def edge_encoder() -> ComponentInstance:
    return Stack(
        VisualEdgeEncoder(
            nodes=['Age', 'Unemployment', 'Education', 'Income'],
            initial_constraints=[
                EdgeConstraint(source='Age', target='Education', type=EdgeConstraintType.FORBIDDEN_EDGE),
                EdgeConstraint(source='Unemployment', target='Education', type=EdgeConstraintType.HARD_UNDIRECTED_EDGE),
                EdgeConstraint(source='Unemployment', target='Income', type=EdgeConstraintType.HARD_DIRECTED_EDGE),
                EdgeConstraint(source='Education', target='Income', type=EdgeConstraintType.HARD_DIRECTED_EDGE),
            ],
            graph_layout=SpringLayout(),
        ),
        show_code(
            edge_encoder_var,
            """
VisualEdgeEncoder(
    nodes=['Age', 'Unemployment', 'Education', 'Income'],
    initial_constraints=[
        EdgeConstraint(source='Age', target='Education', type=EdgeConstraintType.FORBIDDEN_EDGE),
        EdgeConstraint(source='Unemployment', target='Education', type=EdgeConstraintType.HARD_UNDIRECTED_EDGE),
        EdgeConstraint(source='Unemployment', target='Income', type=EdgeConstraintType.HARD_DIRECTED_EDGE),
        EdgeConstraint(source='Education', target='Income', type=EdgeConstraintType.HARD_DIRECTED_EDGE)
    ],
    graph_layout=SpringLayout(),
)
        """,
            'graphs/components',
            'visual_edge_encoder',
        ),
        height='500px',
    )


node_hierarchy_var = Variable(False)


def node_hierarchy_builder() -> ComponentInstance:
    return Stack(
        NodeHierarchyBuilder(
            nodes=[['Age'], ['Unemployment', 'Education'], ['Income']],
        ),
        show_code(
            node_hierarchy_var,
            """
NodeHierarchyBuilder(
            nodes=[['Age'], ['Unemployment', 'Education'], ['Income']],
        )
        """,
            'graphs/components',
            'node_hierarchy_builder',
        ),
        height='500px',
    )


# --------------------------------------------------------------------------------
# Plotting Components
# --------------------------------------------------------------------------------

bokeh_var = Variable(False)


def bokeh() -> ComponentInstance:
    def get_bokeh_figure():

        sigma = 10
        rho = 28
        beta = 8.0 / 3
        theta = 3 * numpy.pi / 4

        def lorenz(xyz, t):
            x, y, z = xyz
            x_dot = sigma * (y - x)
            y_dot = x * rho - x * z - y
            z_dot = x * y - beta * z
            return [x_dot, y_dot, z_dot]

        initial = (-10, -7, 35)
        t = numpy.arange(0, 100, 0.006)

        solution = odeint(lorenz, initial, t)

        x = solution[:, 0]
        y = solution[:, 1]
        z = solution[:, 2]
        xprime = numpy.cos(theta) * x - numpy.sin(theta) * y

        colors = ['#C6DBEF', '#9ECAE1', '#6BAED6', '#4292C6', '#2171B5', '#08519C', '#08306B']

        p = figure(title='Lorenz attractor example', background_fill_color='#fafafa')

        p.multi_line(
            numpy.array_split(xprime, 7), numpy.array_split(z, 7), line_color=colors, line_alpha=0.8, line_width=1.5
        )

        return p

    return Stack(
        Bokeh(get_bokeh_figure()),
        show_code(
            bokeh_var,
            """
def get_bokeh_figure():

    sigma = 10
    rho = 28
    beta = 8.0/3
    theta = 3 * numpy.pi / 4

    def lorenz(xyz, t):
        x, y, z = xyz
        x_dot = sigma * (y - x)
        y_dot = x * rho - x * z - y
        z_dot = x * y - beta* z
        return [x_dot, y_dot, z_dot]

    initial = (-10, -7, 35)
    t = numpy.arange(0, 100, 0.006)

    solution = odeint(lorenz, initial, t)

    x = solution[:, 0]
    y = solution[:, 1]
    z = solution[:, 2]
    xprime = numpy.cos(theta) * x - numpy.sin(theta) * y

    colors = ["#C6DBEF", "#9ECAE1", "#6BAED6", "#4292C6", "#2171B5", "#08519C", "#08306B"]

    p = figure(title="Lorenz attractor example", background_fill_color="#fafafa")

    p.multi_line(numpy.array_split(xprime, 7), numpy.array_split(z, 7),
                line_color=colors, line_alpha=0.8, line_width=1.5)

    return p

Bokeh(get_bokeh_figure())
        """,
            'plotting',
            'bokeh',
        ),
    )


plotly_var = Variable(False)


def plotly() -> ComponentInstance:
    def get_plotly_figure():

        # Load data, define hover text and bubble size
        data = px.data.gapminder()
        df_2007 = data[data['year'] == 2007]
        df_2007 = df_2007.sort_values(['continent', 'country'])

        hover_text = []
        bubble_size = []

        for index, row in df_2007.iterrows():
            hover_text.append(
                (
                    'Country: {country}<br>'
                    + 'Life Expectancy: {lifeExp}<br>'
                    + 'GDP per capita: {gdp}<br>'
                    + 'Population: {pop}<br>'
                    + 'Year: {year}'
                ).format(
                    country=row['country'],
                    lifeExp=row['lifeExp'],
                    gdp=row['gdpPercap'],
                    pop=row['pop'],
                    year=row['year'],
                )
            )
            bubble_size.append(math.sqrt(row['pop']))

        df_2007['text'] = hover_text
        df_2007['size'] = bubble_size
        sizeref = 2.0 * max(df_2007['size']) / (100**2)

        # Dictionary with dataframes for each continent
        continent_names = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania']
        continent_data = {continent: df_2007.query("continent == '%s'" % continent) for continent in continent_names}

        # Create figure
        fig = go.Figure()

        for continent_name, continent in continent_data.items():
            fig.add_trace(
                go.Scatter(
                    x=continent['gdpPercap'],
                    y=continent['lifeExp'],
                    name=continent_name,
                    text=continent['text'],
                    marker_size=continent['size'],
                )
            )

        # Tune marker appearance and layout
        fig.update_traces(mode='markers', marker=dict(sizemode='area', sizeref=sizeref, line_width=2))

        fig.update_layout(
            title='Life Expectancy v. Per Capita GDP, 2007',
            xaxis=dict(
                title='GDP per capita (2000 dollars)',
                gridcolor='white',
                type='log',
                gridwidth=2,
            ),
            yaxis=dict(
                title='Life Expectancy (years)',
                gridcolor='white',
                gridwidth=2,
            ),
            paper_bgcolor='rgb(243, 243, 243)',
            plot_bgcolor='rgb(243, 243, 243)',
        )

        return fig

    return Stack(
        Plotly(get_plotly_figure()),
        show_code(
            plotly_var,
            """
def get_plotly_figure():
    # Load data, define hover text and bubble size
    data = px.data.gapminder()
    df_2007 = data[data['year']==2007]
    df_2007 = df_2007.sort_values(['continent', 'country'])

    hover_text = []
    bubble_size = []

    for index, row in df_2007.iterrows():
        hover_text.append(('Country: {country}<br>'+
                        'Life Expectancy: {lifeExp}<br>'+
                        'GDP per capita: {gdp}<br>'+
                        'Population: {pop}<br>'+
                        'Year: {year}').format(country=row['country'],
                                                lifeExp=row['lifeExp'],
                                                gdp=row['gdpPercap'],
                                                pop=row['pop'],
                                                year=row['year']))
        bubble_size.append(math.sqrt(row['pop']))

    df_2007['text'] = hover_text
    df_2007['size'] = bubble_size
    sizeref = 2.*max(df_2007['size'])/(100**2)

    # Dictionary with dataframes for each continent
    continent_names = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania']
    continent_data = {continent:df_2007.query("continent == '%s'" %continent)
                                for continent in continent_names}

    # Create figure
    fig = go.Figure()

    for continent_name, continent in continent_data.items():
        fig.add_trace(go.Scatter(
            x=continent['gdpPercap'], y=continent['lifeExp'],
            name=continent_name, text=continent['text'],
            marker_size=continent['size'],
            ))

    # Tune marker appearance and layout
    fig.update_traces(mode='markers', marker=dict(sizemode='area',
                                                sizeref=sizeref, line_width=2))

    fig.update_layout(
        title='Life Expectancy v. Per Capita GDP, 2007',
        xaxis=dict(
            title='GDP per capita (2000 dollars)',
            gridcolor='white',
            type='log',
            gridwidth=2,
        ),
        yaxis=dict(
            title='Life Expectancy (years)',
            gridcolor='white',
            gridwidth=2,
        ),
        paper_bgcolor='rgb(243, 243, 243)',
        plot_bgcolor='rgb(243, 243, 243)',
    )

    return fig

Plotly(get_plotly_figure())
        """,
            'plotting',
            'plotly',
        ),
        height='500px',
    )


matplotlib_var = Variable(False)


def matplotlib() -> ComponentInstance:
    def get_matplotlib_figure():
        # see full example here: https://matplotlib.org/stable/gallery/images_contours_and_fields/irregulardatagrid.html#sphx-glr-gallery-images-contours-and-fields-irregulardatagrid-py

        # Create a Figure object
        fig = Figure(figsize=(8, 6))

        # Generate some sample data
        npts = 200
        ngridx = 100
        ngridy = 200
        x = numpy.random.uniform(-2, 2, npts)
        y = numpy.random.uniform(-2, 2, npts)
        z = x * numpy.exp(-(x**2) - y**2)

        # Add a subplot to the Figure
        ax1 = fig.add_subplot()
        ax2 = fig.add_subplot()

        # Create grid values first.
        xi = numpy.linspace(-2.1, 2.1, ngridx)
        yi = numpy.linspace(-2.1, 2.1, ngridy)

        # Linearly interpolate the data (x, y) on a grid defined by (xi, yi).
        triang = tri.Triangulation(x, y)
        interpolator = tri.LinearTriInterpolator(triang, z)
        Xi, Yi = numpy.meshgrid(xi, yi)
        zi = interpolator(Xi, Yi)

        ax1.contour(xi, yi, zi, levels=14, linewidths=0.5, colors='k')
        cntr1 = ax1.contourf(xi, yi, zi, levels=14, cmap='RdBu_r')

        fig.colorbar(cntr1, ax=ax1)
        ax1.plot(x, y, 'ko', ms=3)
        ax1.set(xlim=(-2, 2), ylim=(-2, 2))

        # ----------
        # Tricontour
        # ----------
        # Directly supply the unordered, irregularly spaced coordinates
        # to tricontour.

        ax2.tricontour(x, y, z, levels=14, linewidths=0.5, colors='k')
        cntr2 = ax2.tricontourf(x, y, z, levels=14, cmap='RdBu_r')

        fig.colorbar(cntr2, ax=ax2)
        ax2.plot(x, y, 'ko', ms=3)
        ax2.set(xlim=(-2, 2), ylim=(-2, 2))
        return fig

    return Stack(
        Matplotlib(get_matplotlib_figure()),
        show_code(
            matplotlib_var,
            """
def get_matplotlib_figure():
    # see full example here: https://matplotlib.org/stable/gallery/images_contours_and_fields/irregulardatagrid.html#sphx-glr-gallery-images-contours-and-fields-irregulardatagrid-py
    # Create a Figure object
    fig = Figure(figsize=(8, 6))

    # Generate some sample data
    npts = 200
    ngridx = 100
    ngridy = 200
    x = numpy.random.uniform(-2, 2, npts)
    y = numpy.random.uniform(-2, 2, npts)
    z = x * numpy.exp(-x**2 - y**2)

    # Add a subplot to the Figure
    ax1, ax2 = fig.add_subplot(nrows=2)

    # Create grid values first.
    xi = numpy.linspace(-2.1, 2.1, ngridx)
    yi = numpy.linspace(-2.1, 2.1, ngridy)

    # Linearly interpolate the data (x, y) on a grid defined by (xi, yi).
    triang = tri.Triangulation(x, y)
    interpolator = tri.LinearTriInterpolator(triang, z)
    Xi, Yi = numpy.meshgrid(xi, yi)
    zi = interpolator(Xi, Yi)

    # Note that scipy.interpolate provides means to interpolate data on a grid
    # as well. The following would be an alternative to the four lines above:
    # from scipy.interpolate import griddata
    # zi = griddata((x, y), z, (xi[None, :], yi[:, None]), method='linear')

    ax1.contour(xi, yi, zi, levels=14, linewidths=0.5, colors='k')
    cntr1 = ax1.contourf(xi, yi, zi, levels=14, cmap="RdBu_r")

    fig.colorbar(cntr1, ax=ax1)
    ax1.plot(x, y, 'ko', ms=3)
    ax1.set(xlim=(-2, 2), ylim=(-2, 2))
    ax1.set_title('grid and contour (%d points, %d grid points)' %(npts, ngridx * ngridy))

    # ----------
    # Tricontour
    # ----------
    # Directly supply the unordered, irregularly spaced coordinates
    # to tricontour.

    ax2.tricontour(x, y, z, levels=14, linewidths=0.5, colors='k')
    cntr2 = ax2.tricontourf(x, y, z, levels=14, cmap="RdBu_r")

    fig.colorbar(cntr2, ax=ax2)
    ax2.plot(x, y, 'ko', ms=3)
    ax2.set(xlim=(-2, 2), ylim=(-2, 2))
    ax2.set_title('tricontour (%d points)' % npts)
    return fig

Matplotlib(get_matplotlib_figure()),
            """,
            'plotting',
            'matplotlib',
        ),
    )


seaborn_var = Variable(False)


def seaborn() -> ComponentInstance:
    def get_seaborn_figure():
        # Create a Figure object
        fig = Figure(figsize=(8, 6))

        # Generate some sample data
        tips = sns.load_dataset('tips')

        # Add a subplot to the Figure
        ax = fig.add_subplot()

        # Create a scatter plot using Seaborn
        sns.scatterplot(data=tips, x='total_bill', y='tip', hue='time', style='time', ax=ax)

        # Customize the plot as needed
        ax.set_xlabel('Total Bill')
        ax.set_ylabel('Tip')
        ax.set_title('Scatter Plot with Figure')

        return fig

    return Stack(
        Matplotlib(get_seaborn_figure()),
        show_code(
            matplotlib_var,
            """
def get_seaborn_figure():
    # Create a Figure object
    fig = Figure(figsize=(8, 6))

    # Generate some sample data
    tips = sns.load_dataset('tips')

    # Add a subplot to the Figure
    ax = fig.add_subplot()

    # Create a scatter plot using Seaborn
    sns.scatterplot(data=tips, x='total_bill', y='tip', hue='time', style='time', ax=ax)

    # Customize the plot as needed
    ax.set_xlabel('Total Bill')
    ax.set_ylabel('Tip')
    ax.set_title('Scatter Plot with Figure')

Matplotlib(get_seaborn_figure()),
            """,
            'plotting',
            'matplotlib',
        ),
    )


# --------------------------------------------------------------------------------
# Common Components
# --------------------------------------------------------------------------------

accordion_var = Variable(False)


def accordion() -> ComponentInstance:
    return Stack(
        Accordion(
            items=[
                AccordionItem(
                    label='First item',
                    content=Text('This is some content'),
                    badge=ItemBadge(label='Label', color=Light.colors.violet),
                ),
                AccordionItem(
                    label='Second item',
                    content=Text('This is some content'),
                    badge=ItemBadge(label='Label', color=Light.colors.teal),
                ),
                AccordionItem(
                    label='Third item',
                    content=Text('This is some content'),
                    badge=ItemBadge(label='Label', color=Light.colors.orange),
                ),
            ],
        ),
        show_code(
            accordion_var,
            """
Accordion(
    items=[
        AccordionItem(
            label='First item',
            content=Text('This is some content'),
            badge=ItemBadge(label='Label', color=Light.colors.violet),
        ),
        AccordionItem(
            label='Second item',
            content=Text('This is some content'),
            badge=ItemBadge(label='Label', color=Light.colors.teal),
        ),
        AccordionItem(
            label='Third item',
            content=Text('This is some content'),
            badge=ItemBadge(label='Label', color=Light.colors.orange),
        ),
    ],
)
        """,
            'common',
            'accordion',
        ),
    )


anchor_var = Variable(False)


def anchor() -> ComponentInstance:
    return Stack(
        Anchor('Link to causaLens website', href='https://www.causalens.com/', new_tab=True),
        show_code(
            anchor_var,
            """
Anchor('Link to causaLens website', href='https://www.causalens.com/', new_tab=True)
            """,
            'common',
            'anchor',
        ),
    )


button_var = Variable()


def button() -> ComponentInstance:
    return Stack(
        Text('Default Styles:'),
        Stack(
            Button('Primary', width='180px'),
            Button('Secondary', styling=ButtonStyle.SECONDARY, width='180px'),
            Button('Error', styling=ButtonStyle.ERROR, width='180px'),
            direction='horizontal',
            height='3rem',
        ),
        Text('Outline Styles:'),
        Stack(
            Button('Primary Outline', outline=True, width='180px'),
            Button('Secondary Outline', styling=ButtonStyle.SECONDARY, outline=True, width='180px'),
            Button('Error Outline', styling=ButtonStyle.ERROR, outline=True, width='180px'),
            direction='horizontal',
            height='3rem',
        ),
        Text('Custom Component:'),
        Button(
            Stack(
                Text(
                    'This is an example of a Button with a Stack as its child',
                ),
            ),
            width='564px',
            outline=True,
        ),
        show_code(
            button_var,
            """
Stack(
    Text('Default Styles:'),
    Stack(
        Button('Primary', width='180px'),
        Button('Secondary', styling=ButtonStyle.SECONDARY, width='180px'),
        Button('Error', styling=ButtonStyle.ERROR, width='180px'),
        direction='horizontal',
        height='3rem',
    ),
    Text('Outline Styles:'),
    Stack(
        Button('Primary Outline', outline=True, width='180px'),
        Button('Secondary Outline', styling=ButtonStyle.SECONDARY, outline=True, width='180px'),
        Button('Error Outline', styling=ButtonStyle.ERROR, outline=True, width='180px'),
        direction='horizontal',
        height='3rem',
    ),
    Text('Custom Component:'),
    Button(
        Stack(
            Text(
                'This is an example of a Button with a Stack as its child',
            ),
        ),
        width='564px',
        outline=True,
    ),
)
        """,
            'common',
            'button',
        ),
    )


bullet_list_var = Variable()


def bullet_list() -> ComponentInstance:
    return Stack(
        Stack(
            Stack(
                Text('Ordered BulletList:'),
                BulletList(items=['My', 'ordered', 'Bullet', 'List'], numbered=True),
            ),
            Stack(
                Text('Unordered BulletList:'),
                BulletList(items=['My', 'Unordered', 'Bullet', 'List']),
            ),
            direction='horizontal',
        ),
        show_code(
            bullet_list_var,
            """
Stack(
    Stack(
        Text('Ordered BulletList:'),
        BulletList(items=['My', 'ordered', 'Bullet', 'List'], numbered=True),
    ),
    Stack(
        Text('Unordered BulletList:'),
        BulletList(items=['My', 'Unordered', 'Bullet', 'List']),
    ),
    direction='horizontal',
)
        """,
            'common',
            'bullet_list',
        ),
    )


button_bar_var = Variable(False)


def button_bar() -> ComponentInstance:
    return Stack(
        Text('Primary Style:'),
        ButtonBar(
            items=[
                Item(label='Value 1', value='val1'),
                Item(label='Value 2', value='val2'),
                Item(label='Value 3', value='val3'),
            ],
            height='2.5rem',
        ),
        Text('Secondary Style:'),
        ButtonBar(
            items=[
                Item(label='Value 1', value='val1'),
                Item(label='Value 2', value='val2'),
                Item(label='Value 3', value='val3'),
            ],
            styling='secondary',
            height='2.5rem',
        ),
        show_code(
            button_bar_var,
            """
Stack(
    Text('Primary Style:'),
    ButtonBar(
        items=[
            Item(label='Value 1', value='val1'),
            Item(label='Value 2', value='val2'),
            Item(label='Value 3', value='val3'),
        ],
        height='2.5rem',
    ),
    Text('Secondary Style:'),
    ButtonBar(
        items=[
            Item(label='Value 1', value='val1'),
            Item(label='Value 2', value='val2'),
            Item(label='Value 3', value='val3'),
        ],
        styling='secondary',
        height='2.5rem',
    ),
)
        """,
            'common',
            'button_bar',
        ),
    )


card_var = Variable(False)


def card() -> ComponentInstance:
    return Stack(
        Stack(
            Card(
                Stack(
                    Text('Some content'),
                ),
                title='Title',
                subtitle='subtitle',
            ),
            Card(
                Stack(
                    Text('Some content'),
                ),
                title='Title',
                subtitle='subtitle',
                accent=True,
            ),
            direction='horizontal',
            align='start',
        ),
        show_code(
            card_var,
            """
Stack(
    Card(
        Stack(
            Text('Some content'),
        ),
        title='Title',
        subtitle='subtitle',
    ),
    Card(
        Stack(
            Text('Some content'),
        ),
        title='Title',
        subtitle='subtitle',
        accent=True,
    ),
    direction='horizontal',
    align='start',
)
        """,
            'common',
            'card',
        ),
    )


carousel_var = Variable(False)


def carousel() -> ComponentInstance:
    return Stack(
        Carousel(
            items=[
                CarouselItem(
                    title='Dog',
                    subtitle='Image of a good boy getting his biscuit',
                    image='https://www.preventivevet.com/hs-fs/hubfs/pug%20treats.jpg?width=600&height=300&name=pug%20treats.jpg',
                ),
                CarouselItem(
                    title='Cat',
                    subtitle='Image of a cat staring into oblivion',
                    image='https://moderncat.com/wp-content/uploads/2021/01/bigstock-Domestic-Cat-Beautiful-Old-Ca-353858042.png',
                    component=Button('Component Example'),
                ),
            ]
        ),
        show_code(
            carousel_var,
            """
rate_value = Variable(7)

@py_component
def rate_image(value: int):
    if value < 2:
        return Icon(icon=get_icon('face-sad-tear', size='lg'))
    if value < 4:
        return Icon(icon=get_icon('face-frown', size='lg'))
    if value < 6:
        return Icon(icon=get_icon('face-meh', size='lg'))
    if value <= 8:
        return Icon(icon=get_icon('face-smile', size='lg'))
    return Icon(icon=get_icon('face-laugh-beam', size='lg'))

Carousel(
    items=[
        CarouselItem(
            title='Dog',
            subtitle='Image of a good boy getting his biscuit',
            image='https://www.preventivevet.com/hs-fs/hubfs/pug%20treats.jpg?width=600&height=300&name=pug%20treats.jpg',
            component=Stack(
                Label(
                    Slider(domain=[0, 10], value=rate_value, disable_input_alternative=True),
                    value='Rate this image:',
                    direction='horizontal',
                    bold=True,
                    width='90%',
                ),
                rate_image(rate_value),
                direction='horizontal',
            ),
        ),
        CarouselItem(
            title='Cat',
            subtitle='Image of a cat staring into oblivion',
            image='https://moderncat.com/wp-content/uploads/2021/01/bigstock-Domestic-Cat-Beautiful-Old-Ca-353858042.png',
            component=Button('Component Example'),
        ),
    ]
),
        """,
            'common',
            'carousel',
        ),
    )


checkbox_group_var = Variable(False)


def checkbox_group() -> ComponentInstance:
    return Stack(
        CheckboxGroup(
            select_max=2,
            items=['first', 'second', 'third', 'fourth', 'fifth'],
        ),
        show_code(
            checkbox_group_var,
            """
CheckboxGroup(
    select_max=2,
    items=['first', 'second', 'third', 'fourth', 'fifth'],
)
        """,
            'common',
            'checkbox_group',
        ),
    )


code_var = Variable(False)


def code() -> ComponentInstance:
    return Stack(
        Stack(
            Label(
                Code(code='def some_func():\n    pass', theme=Code.Themes.LIGHT, width='300px', height='100px'),
                value='Light Mode:',
            ),
            Label(
                Code(code='def some_func():\n    pass', theme=Code.Themes.DARK, width='300px', height='100px'),
                value='Dark Mode:',
            ),
            direction='horizontal',
            align='start',
            justify='space-evenly',
        ),
        show_code(
            code_var,
            """
Stack(
    Label(
        Code(code='def some_func():\n    pass', theme=Code.Themes.LIGHT, width='300px', height='100px'),
        value='Light Mode:',
    ),
    Label(
        Code(code='def some_func():\n    pass', theme=Code.Themes.DARK, width='300px', height='100px'),
        value='Dark Mode:',
    ),
    direction='horizontal',
    align='start',
    justify='space-evenly',
)
        """,
            'common',
            'code',
        ),
    )


component_select_list_var = Variable(False)


def component_select_list() -> ComponentInstance:
    return Stack(
        ComponentSelectList(
            items=[
                ComponentItem(title='TitleA', subtitle='subtitle', component=Text('A')),
                ComponentItem(title='TitleB', subtitle='subtitle', component=Text('B')),
                ComponentItem(title='TitleC', subtitle='subtitle', component=Text('C')),
            ],
            selected_items=Variable('TitleA'),
        ),
        show_code(
            component_select_list_var,
            """
ComponentSelectList(
    items=[
        ComponentItem(title='TitleA', subtitle='subtitle', component=Text('A')),
        ComponentItem(title='TitleB', subtitle='subtitle', component=Text('B')),
        ComponentItem(title='TitleC', subtitle='subtitle', component=Text('C')),
    ],
    selected_items=Variable('TitleA'),
)
        """,
            'common',
            'component_select_list',
        ),
    )


datepicker_var = Variable(False)


def datepicker() -> ComponentInstance:
    return Stack(
        Label(Datepicker(), value='Plain datepicker:', width='fit-content'),
        Label(Datepicker(enable_time=True), value='Datepicker with Time:', width='fit-content'),
        Label(Datepicker(range=True), value='Datepicker with Range:', width='fit-content'),
        Label(Datepicker(enable_time=True, range=True), value='Datepicker with Time and Range:', width='fit-content'),
        show_code(
            datepicker_var,
            """
Stack(
    Label(Datepicker(), value='Plain datepicker:', width='fit-content'),
    Label(Datepicker(enable_time=True), value='Datepicker with Time:', width='fit-content'),
    Label(Datepicker(range=True), value='Datepicker with Range:', width='fit-content'),
    Label(Datepicker(enable_time=True, range=True), value='Datepicker with Time and Range:', width='fit-content'),
)
        """,
            'common',
            'datepicker',
        ),
    )


form_var = Variable(False)


def form() -> ComponentInstance:
    return Stack(
        Form(
            FormPage(
                Label(
                    Input(
                        id='name',
                        raw_css="""input {
                        width: 19rem;
                        }""",
                    ),
                    value='Name:',
                    direction='horizontal',
                    label_width='20%',
                    bold=True,
                ),
                Label(
                    Datepicker(id='lifespan', range=True),
                    value='Lifespan:',
                    direction='horizontal',
                    label_width='20%',
                    bold=True,
                ),
                Label(
                    Select(
                        items=[
                            Item(label='dog', value=1),
                            Item(label='cat', value=2),
                            Item(label='parrot', value=3),
                            Item(label='rat', value=4),
                            Item(label='rabbit', value=5),
                        ],
                        id='favourite_pet',
                        multiselect=True,
                        width='19rem',
                    ),
                    value='Favourite pets:',
                    direction='horizontal',
                    label_width='20%',
                    bold=True,
                ),
                height='200px',
            ),
            FormPage(
                Stack(
                    Stack(
                        Label(
                            Slider(
                                domain=[0, 100],
                                ticks=[0, 20, 40, 60, 80, 100],
                                id='employee_number',
                                disable_input_alternative=True,
                                width='70%',
                            ),
                            value='Employee Number:',
                            direction='horizontal',
                            label_width='40%',
                            bold=True,
                        ),
                        Label(
                            Slider(
                                domain=[0, 100],
                                ticks=[0, 20, 40, 60, 80, 100],
                                id='company_culture',
                                disable_input_alternative=True,
                                width='70%',
                            ),
                            value='Company Culture:',
                            direction='horizontal',
                            label_width='40%',
                            bold=True,
                        ),
                    ),
                    Stack(
                        Label(
                            Slider(
                                domain=[0, 100],
                                ticks=[0, 20, 40, 60, 80, 100],
                                id='company_benefits',
                                disable_input_alternative=True,
                                width='70%',
                            ),
                            value='Company Benefits:',
                            direction='horizontal',
                            label_width='40%',
                            bold=True,
                        ),
                        Label(
                            Slider(
                                domain=[0, 100],
                                ticks=[0, 20, 40, 60, 80, 100],
                                id='salary',
                                disable_input_alternative=True,
                                width='70%',
                            ),
                            value='Salary (R$):',
                            direction='horizontal',
                            label_width='40%',
                            bold=True,
                        ),
                    ),
                    direction='horizontal',
                ),
                height='200px',
            ),
            FormPage(
                Label(
                    Input(
                        id='name2',
                        raw_css="""input {
                        width: 19rem;
                        }""",
                    ),
                    value='Dog Name:',
                    direction='horizontal',
                    label_width='20%',
                    bold=True,
                ),
                Label(
                    Datepicker(id='lifespan2', range=True),
                    value='Lifespan of a fly:',
                    direction='horizontal',
                    label_width='20%',
                    bold=True,
                ),
                Label(
                    Select(
                        items=[
                            Item(label='red', value=1),
                            Item(label='blue', value=2),
                            Item(label='green', value=3),
                        ],
                        id='favourite_color',
                        multiselect=True,
                        width='19rem',
                    ),
                    value='Favourite color:',
                    direction='horizontal',
                    label_width='20%',
                    bold=True,
                ),
                height='200px',
            ),
            value=form_value,
            onsubmit=form_value.update(value={}),
        ),
        show_var('Form Variable:', form_value),
        show_code(
            form_var,
            '''
Stack(
    Form(
        FormPage(
            Label(
                Input(
                    id='name',
                    raw_css="""input {
                    width: 19rem;
                    }""",
                ),
                value='Name:',
                direction='horizontal',
                label_width='20%',
                bold=True,
            ),
            Label(
                Datepicker(id='lifespan', range=True),
                value='Lifespan:',
                direction='horizontal',
                label_width='20%',
                bold=True,
            ),
            Label(
                Select(
                    items=[
                        Item(label='dog', value=1),
                        Item(label='cat', value=2),
                        Item(label='parrot', value=3),
                        Item(label='rat', value=4),
                        Item(label='rabbit', value=5),
                    ],
                    id='favourite_pet',
                    multiselect=True,
                    width='19rem',
                ),
                value='Favourite pets:',
                direction='horizontal',
                label_width='20%',
                bold=True,
            ),
            height='200px',
        ),
        FormPage(
            Stack(
                Stack(
                    Label(
                        Slider(
                            domain=[0, 100],
                            ticks=[0, 20, 40, 60, 80, 100],
                            id='employee_number',
                            disable_input_alternative=True,
                            width='70%',
                        ),
                        value='Employee Number:',
                        direction='horizontal',
                        label_width='40%',
                        bold=True,
                    ),
                    Label(
                        Slider(
                            domain=[0, 100],
                            ticks=[0, 20, 40, 60, 80, 100],
                            id='company_culture',
                            disable_input_alternative=True,
                            width='70%',
                        ),
                        value='Company Culture:',
                        direction='horizontal',
                        label_width='40%',
                        bold=True,
                    ),
                ),
                Stack(
                    Label(
                        Slider(
                            domain=[0, 100],
                            ticks=[0, 20, 40, 60, 80, 100],
                            id='company_benefits',
                            disable_input_alternative=True,
                            width='70%',
                        ),
                        value='Company Benefits:',
                        direction='horizontal',
                        label_width='40%',
                        bold=True,
                    ),
                    Label(
                        Slider(
                            domain=[0, 100],
                            ticks=[0, 20, 40, 60, 80, 100],
                            id='salary',
                            disable_input_alternative=True,
                            width='70%',
                        ),
                        value='Salary (R$):',
                        direction='horizontal',
                        label_width='40%',
                        bold=True,
                    ),
                ),
                direction='horizontal',
            ),
            height='200px',
        ),
        FormPage(
            Label(
                Input(
                    id='name2',
                    raw_css="""input {
                    width: 19rem;
                    }""",
                ),
                value='Dog Name:',
                direction='horizontal',
                label_width='20%',
                bold=True,
            ),
            Label(
                Datepicker(id='lifespan2', range=True),
                value='Lifespan of a fly:',
                direction='horizontal',
                label_width='20%',
                bold=True,
            ),
            Label(
                Select(
                    items=[
                        Item(label='red', value=1),
                        Item(label='blue', value=2),
                        Item(label='green', value=3),
                    ],
                    id='favourite_color',
                    multiselect=True,
                    width='19rem',
                ),
                value='Favourite color:',
                direction='horizontal',
                label_width='20%',
                bold=True,
            ),
            height='200px',
        ),
        value=form_value,
        onsubmit=form_value.update(value={}),
    ),
    show_var('Form Variable:', form_value),
)
        ''',
            'common',
            'form',
        ),
    )


grid_var = Variable(False)


def grid() -> ComponentInstance:
    return Stack(
        Grid(
            Grid.Row(
                Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
                Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
                Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
                Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
                Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
                Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
                column_gap=1,
            ),
            Grid.Row(
                Grid.Column(Text('Span = 4'), span=4, background='dodgerblue'),
                Grid.Column(Text('Span = 4'), span=4, background='dodgerblue'),
                Grid.Column(Text('Span = 4'), span=4, background='dodgerblue'),
                column_gap=1,
            ),
            Grid.Row(
                Grid.Column(Text('Span = 6'), span=6, background='skyblue'),
                Grid.Column(Text('Span = 6'), span=6, background='skyblue'),
                column_gap=1,
            ),
            Grid.Row(
                Grid.Column(Text('Span = 12'), span=12, background='steelblue'),
            ),
        ),
        show_code(
            grid_var,
            """
Grid(
    Grid.Row(
        Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
        Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
        Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
        Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
        Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
        Grid.Column(Text('Span = 2'), span=2, background='deepskyblue'),
        column_gap=1,
    ),
    Grid.Row(
        Grid.Column(Text('Span = 4'), span=4, background='dodgerblue'),
        Grid.Column(Text('Span = 4'), span=4, background='dodgerblue'),
        Grid.Column(Text('Span = 4'), span=4, background='dodgerblue'),
        column_gap=1,
    ),
    Grid.Row(
        Grid.Column(Text('Span = 6'), span=6, background='skyblue'),
        Grid.Column(Text('Span = 6'), span=6, background='skyblue'),
        column_gap=1,
    ),
    Grid.Row(
        Grid.Column(Text('Span = 12'), span=12, background='steelblue'),
    ),
)
        """,
            'common',
            'grid',
        ),
    )


heading_var = Variable(False)


def heading() -> ComponentInstance:
    return Stack(
        Heading('Heading 1', level=1),
        Heading('Heading 2', level=2),
        Heading('Heading 3', level=3),
        show_code(
            heading_var,
            """
Stack(
    Heading('Heading 1', level=1),
    Heading('Heading 2', level=2),
    Heading('Heading 3', level=3),
)
        """,
            'common',
            'heading',
        ),
    )


html_raw_var = Variable(False)


def html_raw() -> ComponentInstance:
    return Stack(
        HtmlRaw(
            html='<iframe height="100%" width="100%" src="https://www.youtube.com/embed/tgbNymZ7vqY"></iframe>',
            raw_css={'min-height': '400px'},
        ),
        show_code(
            html_raw_var,
            """
HtmlRaw(
    html='<iframe height="100%" width="100%" src="https://www.youtube.com/embed/tgbNymZ7vqY"></iframe>',
    raw_css={'min-height': '400px'},
)
        """,
            'common',
            'html_raw',
        ),
    )


icon_var = Variable(False)


def icon() -> ComponentInstance:
    return Stack(
        Icon(
            icon=get_icon('spaghetti-monster-flying', size='10x'),
        ),
        show_code(
            icon_var,
            """
Icon(
    icon=get_icon('spaghetti-monster-flying', size='10x'),
)
        """,
            'common',
            'icon',
        ),
    )


image_var = Variable(False)


def image() -> ComponentInstance:
    return Stack(
        Image(src='https://i.natgeofe.com/n/f9e19f16-ecb4-4cd3-9fe9-83423ace1b1a/tree-goats-morocco.jpg'),
        show_code(
            image_var,
            """
Image(src='https://i.natgeofe.com/n/f9e19f16-ecb4-4cd3-9fe9-83423ace1b1a/tree-goats-morocco.jpg')
        """,
            'common',
            'image',
        ),
    )


input_var = Variable(False)


def input() -> ComponentInstance:
    return Stack(
        Label(Input(), value='Text Input:'),
        Label(Input(type='number'), value='Numeric Input:'),
        show_code(
            input_var,
            """
Stack(
    Label(Input(), value='Text Input:'),
    Label(Input(type='number'), value='Numeric Input:'),
)
        """,
            'common',
            'input',
        ),
    )


label_var = Variable(False)


def label() -> ComponentInstance:
    return Stack(
        Label(
            Input(),
            value='Vertical Label:',
        ),
        Label(
            Input(),
            value='Horizontal Label:',
            direction='horizontal',
        ),
        show_code(
            label_var,
            """
Stack(
    Label(
        Input(),
        value='Vertical Label:',
    ),
    Label(
        Input(),
        value='Horizontal Label:',
        direction='horizontal',
    ),
)
        """,
            'common',
            'label',
        ),
    )


markdown_var = Variable(False)


def markdown() -> ComponentInstance:
    return Stack(
        Markdown(' ## Heading\n ### Subheading\n Some other text'),
        show_code(
            markdown_var,
            """
Markdown(' ## Heading\\n ### Subheading\\n Some other text')
            """,
            'common',
            'markdown',
        ),
    )


modal_var = Variable(False)


def modal() -> ComponentInstance:
    return Stack(
        Button('Click to show modal', onclick=show_modal.update(value=True)),
        Modal(
            Stack(Text('This is a sample Modal'), justify='center', align='center'),
            show=show_modal,
        ),
        show_code(
            modal_var,
            """
Stack(
    Button('Click to show modal', onclick=show_modal.update(value=True)),
    Modal(
        Stack(Text('This is a sample Modal'), justify='center', align='center'),
        show=show_modal,
    ),
)
            """,
            'common',
            'modal',
        ),
    )


overlay_var = Variable(False)


def overlay() -> ComponentInstance:
    return Stack(
        Label(Switch(value=show_overlay), value='Show Overlay:'),
        Overlay(Text('Overlay Text'), show=show_overlay),
        show_code(
            overlay_var,
            """
Stack(
    Label(Switch(value=show_overlay), value='Show Overlay:'),
    Overlay(Text('Overlay Text'), show=show_overlay),
)
        """,
            'common',
            'overlay',
        ),
    )


paragraph_var = Variable(False)


def paragraph() -> ComponentInstance:
    return Stack(
        Paragraph(
            Text(
                'This is a nice way of combining different Text components, this is especially useful as it allows to switch between different styles such as:'
            ),
            Text('Bold,', bold=True),
            Text('Italic,', italic=True),
            Text('different font sizes...', raw_css={'font-size': '0.75rem'}),
        ),
        Text('different font sizes...', raw_css={'font-size': '0.75rem'}),
        show_code(
            paragraph_var,
            """
Paragraph(
    Text(
        'This is a nice way of combining different Text components, this is especially useful as it allows to switch between different styles such as:'
    ),
    Text('Bold,', bold=True),
    Text(
        'Italic,',
        italic=True
    ),
    Text('different font sizes...', raw_css={'font-size': '0.75rem'}),
)
        """,
            'common',
            'paragraph',
        ),
    )


progress_bar_var = Variable(False)


def progress_bar() -> ComponentInstance:
    return Stack(
        ProgressBar(progress=Variable(30), height='3rem'),
        show_code(
            progress_bar_var,
            """
ProgressBar(progress=Variable(30), height='3rem')
        """,
            'common',
            'progress_bar',
        ),
    )


radio_group_var = Variable(False)


def radio_group() -> ComponentInstance:
    return Stack(
        Label(
            RadioGroup(
                items=['first', 'second', 'third'],
                value=Variable('first'),
            ),
            value='Vertical:',
        ),
        Label(
            RadioGroup(items=['first', 'second', 'third'], value=Variable('first'), direction='horizontal'),
            value='Horizontal:',
        ),
        show_code(
            radio_group_var,
            """
Stack(
    Label(
        RadioGroup(
            items=['first', 'second', 'third'],
            value=Variable('first'),
        ),
        value='Vertical:',
    ),
    Label(
        RadioGroup(items=['first', 'second', 'third'], value=Variable('first'), direction='horizontal'),
        value='Horizontal:',
    ),
)
        """,
            'common',
            'radio_group',
        ),
    )


select_var = Variable(False)


def select() -> ComponentInstance:
    return Stack(
        Label(
            Select(items=['first', 'second', 'third'], height='2.5rem'),
            value='Simple:',
        ),
        Label(
            Select(items=['first', 'second', 'third', 'fourth', 'fifth'], searchable=True, height='2.5rem'),
            value='Searchable:',
        ),
        Label(
            Select(items=['first', 'second', 'third', 'fourth', 'fifth'], multiselect=True, height='2.5rem'),
            value='Multiselect:',
        ),
        show_code(
            select_var,
            """
Stack(
    Label(
        Select(items=['first', 'second', 'third'], height='2.5rem'),
        value='Simple:',
    ),
    Label(
        Select(items=['first', 'second', 'third', 'fourth', 'fifth'], searchable=True, height='2.5rem'),
        value='Searchable:',
    ),
    Label(
        Select(items=['first', 'second', 'third', 'fourth', 'fifth'], multiselect=True, height='2.5rem'),
        value='Multiselect:',
    ),
)
        """,
            'common',
            'select',
        ),
    )


slider_var = Variable(False)


def slider() -> ComponentInstance:
    return Stack(
        Label(
            Slider(domain=[0.0, 1.0], disable_input_alternative=True),
            value='Plain:',
        ),
        Label(
            Slider(
                domain=[-10, 10],
                step=2,
                rail_from_start=False,
                rail_labels=['My Slider'],
                rail_to_end=True,
                ticks=[-9, -5, -1, 1, 5, 9],
                value=Variable([-3, 6, 8]),
            ),
            value='A more complex example:',
        ),
        show_code(
            slider_var,
            """
Stack(
    Label(
        Slider(domain=[0.0, 1.0], disable_input_alternative=True),
        value='Plain:',
    ),
    Label(
        Slider(
            domain=[-10, 10],
            step=2,
            rail_from_start=False,
            rail_labels=['My Slider'],
            rail_to_end=True,
            ticks=[-9, -5, -1, 1, 5, 9],
            value=Variable([-3, 6, 8]),
        ),
        value='A more complex example:',
    ),
)
        """,
            'common',
            'slider',
        ),
    )


spacer_var = Variable(False)


def spacer() -> ComponentInstance:
    return Stack(
        Text('Empty Spacer:'),
        Spacer(),
        Text('Line Spacer:'),
        Spacer(line=True),
        Text('Custom Line Length Spacers:'),
        Spacer(line=True, inset='4rem'),
        show_code(
            spacer_var,
            """
Stack(
    Text('Empty Spacer:'),
    Spacer(),
    Text('Line Spacer:'),
    Spacer(line=True),
    Text('Custom Line Length Spacers:'),
    Spacer(line=True, inset='4rem'),
)
        """,
            'common',
            'spacer',
        ),
    )


stack_var = Variable(False)


def stack() -> ComponentInstance:
    return Stack(
        Stack(
            Text('Vertical Stack:'),
            Stack(
                Card(
                    Stack(Text('50%'), align='center', justify='center'),
                    accent=True,
                    padding='0px',
                ),
                Card(Stack(Text('30%'), align='center', justify='center'), accent=True, padding='0px', height='30%'),
                Card(Stack(Text('20%'), align='center', justify='center'), accent=True, padding='0px', height='20%'),
                width='40%',
            ),
            Text('Horizontal Stack:'),
            Stack(
                Card(Stack(Text('30%'), align='center', justify='center'), accent=True, width='30%'),
                Card(Stack(Text('20%'), align='center', justify='center'), accent=True, width='20%'),
                Card(
                    Stack(Text('50%'), align='center', justify='center'),
                    accent=True,
                ),
                height='30%',
                direction='horizontal',
            ),
            height=450,
        ),
        show_code(
            stack_var,
            """
Stack(
    Text('Vertical Stack:'),
    Stack(
        Card(
            Stack(Text('50%'), align='center', justify='center'),
            accent=True,
            padding='0px',
        ),
        Card(
            Stack(Text('30%'), align='center', justify='center'),
            accent=True,
            padding='0px',
            height='30%'
        ),
        Card(
            Stack(Text('20%'), align='center', justify='center'),
            accent=True,
            padding='0px',
            height='20%'
        ),
        width='40%',
    ),
    Text('Horizontal Stack:'),
    Stack(
        Card(
            Stack(Text('30%'), align='center', justify='center'),
            accent=True,
            width='30%',
        ),
        Card(
            Stack(Text('20%'), align='center', justify='center'),
            accent=True,
            width='20%',
        ),
        Card(
            Stack(Text('50%'), align='center', justify='center'),
            accent=True,
        ),
        height='30%',
        direction='horizontal',
    ),
    raw_css={'min-height': '450px'},
)
        """,
            'common',
            'stack',
        ),
        raw_css={'min-height': '460px'},
    )


switch_var = Variable(False)


def switch() -> ComponentInstance:
    return Stack(
        Switch(),
        show_code(
            switch_var,
            """
Switch()
        """,
            'common',
            'switch',
        ),
    )


tabbed_card_var = Variable(False)


def tabbed_card() -> ComponentInstance:
    return Stack(
        TabbedCard(Tab(Text('Some Text'), title='Tab 1'), Tab(Text('Some Text'), title='Tab 2')),
        show_code(
            tabbed_card_var,
            """
TabbedCard(
    Tab(Text('Some Text'), title='Tab 1'),
    Tab(Text('Some Text'), title='Tab 2')
        """,
            'common',
            'tabbed_card',
        ),
    )


table_var = Variable(False)


def table() -> ComponentInstance:
    columns = [
        Table.column(col_id='col1', label='Col 1', filter=Table.TableFilter.TEXT),
        Table.column(col_id='col2', label='Col 2', filter=Table.TableFilter.NUMERIC),
        Table.column(col_id='col3', label='Col 3', filter=Table.TableFilter.CATEGORICAL, unique_items=['M', 'F']),
        Table.column(
            col_id='col4',
            label='Col 4',
            filter=Table.TableFilter.DATETIME,
            formatter={'type': Table.TableFormatterType.DATETIME, 'format': 'dd/MM/yyyy'},
        ),
    ]

    return Stack(
        Table(columns=columns, data=data),
        show_code(
            table_var,
            """
data = DataVariable(
    DataFrame(
        [
            {
                'col1': 'a',
                'col2': 1,
                'col3': 'F',
                'col4': '1990-02-12T00:00:00.000Z',
            },
            {
                'col1': 'b',
                'col2': 2,
                'col3': 'M',
                'col4': '1991-02-12T00:00:00.000Z',
            },
            {
                'col1': 'c',
                'col2': 3,
                'col3': 'M',
                'col4': '1991-02-12T00:00:00.000Z',
            },
            {
                'col1': 'd',
                'col2': 4,
                'col3': 'F',
                'col4': '1994-02-07T00:00:00.000Z',
            },
            {
                'col1': 'abc',
                'col2': 4,
                'col3': 'M',
                'col4': '1993-12-12T00:00:00.000Z',
            },
        ]
    )
)

columns = [
    Table.column(col_id='col1', label='Col 1', filter=Table.TableFilter.TEXT),
    Table.column(col_id='col2', label='Col 2', filter=Table.TableFilter.NUMERIC),
    Table.column(col_id='col3', label='Col 3', filter=Table.TableFilter.CATEGORICAL, unique_items=['M', 'F']),
    Table.column(
        col_id='col4',
        label='Col 4',
        filter=Table.TableFilter.DATETIME,
        formatter={'type': Table.TableFormatterType.DATETIME, 'format': 'dd/MM/yyyy'},
    ),
]

Table(columns=columns, data=data, max_rows=5)
            """,
            'common',
            'table',
        ),
        height='400px',
    )


text_var = Variable(False)


def text() -> ComponentInstance:
    return Stack(
        Text('A component for displaying text'),
        show_code(
            text_var,
            """
Text('A component for displaying text')
        """,
            'common',
            'text',
        ),
    )


textarea_var = Variable(False)


def textarea() -> ComponentInstance:
    return Stack(
        Textarea(),
        show_code(
            textarea_var,
            """
Textarea()
        """,
            'common',
            'textarea',
        ),
    )


tooltip_var = Variable(False)


def tooltip() -> ComponentInstance:
    return Stack(
        Stack(
            Tooltip(
                Text('Hover me', width='100px'),
                content='This is a tooltip!',
            ),
            align='center',
        ),
        show_code(
            tooltip_var,
            """
Stack(
    Tooltip(
        Text('Hover me', width='100px'),
        content="This is a tooltip!",
    ),
    align='center',
)
        """,
            'common',
            'tooltip',
        ),
    )
