---
title: "Async: Heavy I/O Bound Computations"
---

I/O bound calculations are functions that spend most of their time waiting for other things to happen, for example file system reads/writes. These kind of calculations should not cause many issues for the framework and can be largely
left to run as they are. The threads of the underlying web server will handle this without blocking the server itself.

However, there are only a limited number of threads running, configurable via the `DARA_NUM_COMPONENT_THREADS` environment variable. If your app is under heavy use then you may run into some blocking behavior at this point. Due to these constraints you should try to use async compatible I/O libraries wherever possible as this will free up the threads more often whilst processing calculations with a lot of waiting.

Both the `dara.core.visual.dynamic_component.py_component` decorator and `dara.core.interactivity.derived_variable.DerivedVariable` support python's `asyncio` out of the box and the underlying web server is `uvicorn` which is designed to work with asyncio based code.

The example below shows how the `sql_alchemy` package can be used in async mode with the Dara framework to make a simple database search engine.

```python
import asyncio

from dara.core import ConfigurationBuilder, Variable, DerivedVariable
from dara.components import BulletList, Stack, Input
from sqlalchemy.ext.asyncio import create_async_engine

# Connect to the sql alchemy engine
engine = create_async_engine("postgresql+asyncpg://user:pw@localhost/test", echo=True)

config = ConfigurationBuilder()

# Define an async function to derive the state of a DerivedVariable
async def fetch_data(search_term: str):
    if search_term:
        async with engine.connect() as conn:
            result = await conn.execute(select(t1).where(t1.c.name == search_term))
            return result.fetchall()
    return []

# Define the UI state, one variable for tracking the input and then a DerivedVariable for the results
search_term = Variable()
var = DerivedVar(fetch_data, variables=[search_term])

# Show a simple page that let's you input the search via an input and shows the results in a list
config.add_page('List', content=Stack(Input(search_term), BulletList(var)))
```
