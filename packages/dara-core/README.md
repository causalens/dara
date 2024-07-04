# Dara Application Framework

<picture>
    <source srcset="https://github.com/causalens/dara/blob/master/img/dara_dark.svg?raw=true" media="(prefers-color-scheme: dark)">
    <img src="https://github.com/causalens/dara/blob/master/img/dara_light.svg?raw=true" alt="Dara Logo">
</picture>

![Master tests](https://github.com/causalens/dara/actions/workflows/tests.yml/badge.svg?branch=master)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![PyPI](https://img.shields.io/pypi/v/dara-core.svg?color=dark-green)](https://pypi.org/project/dara-core/)
[![PyPI - Python Version](https://img.shields.io/pypi/pyversions/dara-core.svg?color=dark-green)](https://pypi.org/project/dara-core/)
[![NPM](https://img.shields.io/npm/v/@darajs/components.svg?color=dark-green)](https://www.npmjs.com/package/@darajs/components)

### Build decision apps in Python

_Tap into the power of causality by transforming data into interactive graphs and applications_

Dara is a dynamic application framework designed for creating interactive web apps with ease, all in pure Python. Over the past two years, Dara has fueled the development of hundreds of apps, now widely used and appreciated by both our customers and our in-house teams!

## Quickstart

To get started with Dara, you can use the `create-dara-app` CLI tool to create a new app.

```bash
pip install create-dara-app
```

You can also use [`pipx`](https://pypa.github.io/pipx/) to install the CLI tool in an isolated environment.

Then simply run the following command to create a new app.

```bash
create-dara-app
```

By default the CLI will attempt to scaffold your project with [`poetry`](https://python-poetry.org/) but will fall back to `pip` if `poetry` is not present. This can be overriden with `--packaging pip` or `--packaging poetry` flag.

After the project is created, you can run it with:

```bash
cd my-dara-app

# with poetry installation
poetry run dara start

# with pip installation make sure to activate the new virtual environment
source .venv/bin/activate
dara start
```

![Dara App](https://github.com/causalens/dara/blob/master/img/components_gallery.png?raw=true)

Note: `pip` installation uses [PEP 660](https://peps.python.org/pep-0660/) `pyproject.toml`-based editable installs which require `pip >= 21.3` and `setuptools >= 64.0.0`. You can upgrade both with:

```bash
python -m pip install --upgrade pip
pip install --user --upgrade setuptools
```

For more details check out our [Documentation](https://dara.causalens.com/docs/category/build-dara-apps).

## Dara App examples

Explore some of our favorite apps - a great way of getting started and getting to know the framework!

| Dara App                                                                                                 | Description                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Large Language Model](https://github.com/causalens/dara/blob/master/img/llm.png?raw=true)              | Demonstrates how to use incorporate a LLM chat box into your decision app to understand model insights                                                                                                            |
| ![Plot Interactivity](https://github.com/causalens/dara/blob/master/img/plot_interactivity.png?raw=true) | Demonstrates how to enable the user to interact with plots, trigger actions based on clicks, mouse movements and other interactions with `Bokeh` or `Plotly` plots                                                |
| ![Graph Editor](https://github.com/causalens/dara/blob/master/img/graph_viewer.png?raw=true)             | Demonstrates how to use the `CausalGraphViewer` component to display your graphs or networks, customising the displayed information through colors and tooltips, and updating the page based on user interaction. |

Check out our [App Gallery](https://dara.causalens.com/gallery) for more inspiration!

## Repository introduction

This repository covers the Dara Application Framework first-party packages.

- `dara-core`: The core of the Dara framework, this includes the core framework code for creating applications.
- `dara-components`: Components for the Dara Framework.
- `create-dara-app`: A CLI tool for creating new Dara applications.

More information on the repository structure can be found in the [CONTRIBUTING.md](https://github.com/causalens/dara/blob/master/CONTRIBUTING.md) file.

## License

Dara is open-source and licensed under the [Apache 2.0 License](https://github.com/causalens/dara/blob/master/LICENSE).
