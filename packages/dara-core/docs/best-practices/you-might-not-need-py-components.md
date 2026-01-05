---
title: You Might Not Need `py_component`
description: Learn how to avoid unnecessary py_components
---

`py_component` can be a powerful tool to compute arbitrary UI based on the state of your application.
However, it is an **escape hatch** from the more optimized declarative rendering that Dara provides.
In the majority of cases, you will not need to use `py_component`. Removing `py_component`s from your code will make it more readable, performant and provide a better UX to your users. In this section you will learn how to avoid unnecessary `py_component`s.

Let's look at a few examples of common scenarios where you might be able to avoid the use of `py_component`s.

## Conditional Rendering

Suppose you have a part of UI where you select a country from a list and then display details about it next to it if one is selected.
Your instinct might be to use a `py_component` to render the details side:

```python
from dara.core import Variable, py_component
from dara.components import Heading, Stack, Select, Text

# Some function to retrieve the details
def get_details(country: str) -> str:
    return f'Details for {country}'

selected_country = Variable(default=None)

# AVOID: unnecessary py_component:
# - involves simple control flow that could be handled with If
# - doesn't cache the results
@py_component
def CountryDetails(country: str | None):
    if country is None:
        return Text('No country selected')

    return Text(get_details(country))

def Content():
    return Stack(
        Heading('Select a country'),
        Select(
            value=selected_country,
            items=['USA', 'Canada', 'Mexico', 'UK', 'France'],
            placeholder='Select a country'
        ),
        Heading('Details'),
        CountryDetails(country=selected_country)
    )
```

There's a few issues with this approach:
- the entire `CountryDetails` part of the page will be re-rendered every time the `selected_country` changes
- we aren't utilizing any caching or memoization - if `get_details` comes from e.g. an external API, it will be called every time the `selected_country` changes

To avoid these, we could utilize `If` for conditional rendering and extract details into a `DerivedVariable`:

```python
from dara.core import Variable, DerivedVariable, py_component
from dara.components import Heading, Stack, Select, Text

# Some function to retrieve the details
def get_details(country: str) -> str:
    return f'Details for {country}'

selected_country = Variable(default=None)

# GOOD: DerivedVariable caches results per selected_country
details = DerivedVariable(lambda country: get_details(country), variables=[selected_country])

def Content():
    return Stack(
        Heading('Select a country'),
        Select(
            value=selected_country,
            items=['USA', 'Canada', 'Mexico', 'UK', 'France'],
            placeholder='Select a country'
        ),
        Heading('Details'),
        # GOOD: If for conditional rendering
        If(selected_country, Text(details), Text('No country selected'))
    )
```

When simple control flow is involved, **prefer `If` over `py_component`**. This is because `If` is optimized to perform client-side comparisons in most cases without extra round-trips to the server.

## Displaying multiple elements based on a collection of data

A very common scenario you will encounter is trying to display multiple elements based on a collection of data. For example, you might have a list of items computed from a database and you want to display a list of `Card`s for each one with their details.

You might think to use a `py_component` to create the list of `Card`s dynamically:

```python
from typing import TypedDict
from dara.core import Variable, py_component
from dara.components import Card, Stack, Text, Heading

class DatabaseItem(TypedDict):
    id: int
    name: str
    description: str

async def get_items(query: str) -> list[DatabaseItem]:
    # fake DB API
    return await DB.query(name=query)

query = Variable(default='')
# Good: cached results per query
items = DerivedVariable(get_items, variables=[query])

# AVOID: unnecessary py_component
@py_component
def ItemsDisplay(items: list[DatabaseItem]):
    stack = Stack()

    for item in items:
        stack.append(
            Card(
                Stack(
                    Text(item['name']),
                    Text(item['description'])
                )
            )
        )

    return stack

def Content():
    return Stack(
        Heading('Search for items'),
        Input(value=query),
        Heading('Items'),
        # AVOID: unnecessary py_component
        ItemsDisplay(items=items)
    )
```

While this approach works, it is not ideal. The entire `ItemsDisplay` component will have to re-run every time the `items` variable changes. This is not very performant, as we need to make a round-trip to the server, and doesn't provide a great UX - the user will see the fallback display while the items are re-fetched.

To avoid this, we can use the built-in `For` component:

```python
from typing import TypedDict
from dara.core import Variable, DerivedVariable, py_component
from dara.components import Card, Stack, Text, Heading, For

class DatabaseItem(TypedDict):
    id: int
    name: str
    description: str

async def get_items(query: str) -> list[DatabaseItem]:
    # fake DB API
    return await DB.query(name=query)

query = Variable(default='')
# GOOD: cached results per query
items = DerivedVariable(get_items, variables=[query])

def Content():
    return Stack(
        Heading('Search for items'),
        Input(value=query),
        Heading('Items'),
        # GOOD: For component used to render multiple elements
        For(
            items=items,
            renderer=Card(
                Stack(
                    Text(items.list_item['name']),
                    Text(items.list_item['description'])
                )
            ),
            key_accessor='id'
        )
    )
```

This makes the code more readable and performant. The `For` component will not show its fallback display after the initial load of `items`, and will update whenever `items` changes.

:::warning

Do not use `@py_component` inside a `For` renderer - this defeats the purpose of the optimized loop since each item would require a separate backend call. If you need to transform item data, precompute the fields in a `DerivedVariable`:

```python
# GOOD: precompute derived fields once for the whole list
def add_formatted_fields(items):
    return [{'display_name': f"{item['name']} - {item['description'][:20]}", **item} for item in items]

formatted_items = DerivedVariable(add_formatted_fields, variables=[items])

For(
    items=formatted_items,
    renderer=Card(Text(formatted_items.list_item['display_name'])),
    key_accessor='id'
)
```

:::

You might notice that we're introducing a new problem here, state tearing - the `For` component will display effectively stale content while the new items are being fetched. You can show an affordance to the user while the content is being reloaded by combining the [`is_loading` state variable](#state-tracking) on `items` with the `SwitchVariable`:

```python
# rest of the code omitted for brevity

items = DerivedVariable(get_items, variables=[query])

For(
    items=items,
    renderer=Card(
        Stack(
            Text(items.list_item['name']),
            Text(items.list_item['description'])
        )
    ),
    key_accessor='id',
    raw_css=SwitchVariable.when(
        condition=items.is_loading,
        true_value='opacity: 0.5;',
        false_value=''
    )
)
```

In the snippet above, we're using the `SwitchVariable` to conditionally apply a CSS style to the `For` component. This is a common pattern in Dara apps, where you might want to show that the data is being fetched but still display the stale data. Alternatively, you might display e.g. a spinner next to the search box which you could achieve using an `If` based on the `is_loading` state as well.

## Initializing state of a part of the page on load

There are a few common scenarios where you might want to initialize the state of your page based on some external system. Your instinct might be to use a `py_component`:

```python
from dara.core import py_component, ConfigurationBuilder, Variable
from dara.components import Text, Stack

@py_component
async def InnerContent():
    # AVOID: doing all the work in a py_component to initialize state
    db_countries = await DB.get_countries() # fake DB API
    available_countries = Variable(default=db_countries)
    selected_country = Variable(default=db_countries[0])

    return Stack(
        Heading('Select a country'),
        Select(
            value=selected_country,
            items=available_countries,
        ),
        Heading('Details'),
        # Omitted: details component for selected country
        CountryDetails(country=selected_country)
    )

config = ConfigurationBuilder()
config.router.add_page(path='countries', content=InnerContent())
```

In the above example, we're using a `py_component` to ensure the logic inside it runs on every page load and initializes the state of the page. This is a common pattern in Dara apps, where you might want to initialize the state of a page based on some external system, e.g. a database or an API. There are however a few issues with it:
- we're not utilizing any caching at all
- we're causing a waterfall of requests to the backend server
- the UX is not great - the user will immediately see a spinner since we have to request the `InnerContent` as soon as we navigate to the page

To avoid these issues, depending on your use case you might want to consider one of the following:

### Use `DerivedVariable` and `Variable.create_from_derived` APIs for state initialization

```python
from dara.core import py_component, ConfigurationBuilder, Variable, Cache
from dara.components import Text, Stack

async def Content():
    # GOOD: retrieve the data in a cached DerivedVariable - cache setting can be tweaked to e.g. store for 30 seconds
    available_countries = DerivedVariable(DB.get_countries, variables=[], cache=Cache.TTL(ttl=30))

    # GOOD: compute first item and use it as default value for the Variable
    first_item = DerivedVariable(lambda: available_countries[0], variables=[available_countries], cache=Cache.TTL(ttl=30))
    selected_country = Variable.create_from_derived(first_item)

    return Stack(
        Heading('Select a country'),
        Select(
            value=selected_country,
            items=available_countries,
        ),
        Heading('Details'),
        # Omitted: details component for selected country
        CountryDetails(country=selected_country)
    )

config = ConfigurationBuilder()
config.router.add_page(path='countries', content=Content)
```

In the above example, `selected_country` will default to the computed `first_item` but keep user updates. Whenever `available_countries` change, it will reset back to the `first_item`.

### Utilize a route `on_load` action to initialize the state

```python
from dara.core import py_component, ConfigurationBuilder, Variable, Cache, action
from dara.components import Text, Stack

available_countries = Variable()
selected_country = Variable()

# GOOD: initialize state on load based on external system
@action
async def countries_loader(ctx: action.Ctx):
    db_countries = await DB.get_countries() # fake DB API
    await ctx.update(variable=available_countries, value=db_countries)
    await ctx.update(variable=selected_country, value=db_countries[0])


async def CountriesContent():
    return Stack(
        Heading('Select a country'),
        Select(
            value=selected_country,
            items=available_countries,
        ),
        Heading('Details'),
        # Omitted: details component for selected country
        CountryDetails(country=selected_country)
    )

config = ConfigurationBuilder()
config.router.add_page(path='countries', content=CountriesContent, on_load=countries_loader())
```

Dara will ensure that the `countries_loader` runs before the page is rendered so the state is initialized.

