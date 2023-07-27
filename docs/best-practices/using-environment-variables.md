---
title: Using Environment Variables
---

Environment variables are defined at a system-wide level and can benefit your app in a couple ways. 

### Easier Workflow and Fewer Mistakes

By managing them in one place, you don't have to worry about where they are being used in your app leading to an easier workflow and fewer mistakes in production. You will want to keep values like your data path in your in environment so that if it changes you only have to update the value in one place. 

```sh title=.env
DATA_ROOT=/my_data_mount/app_data
```

```python title=main.py
import os
import pandas

DATA_ROOT = os.environ.get('DATA_ROOT', './data')

DATA = pandas.read_csv(os.path.join(DATA_ROOT, 'my_dataset.csv'))
```
:::tip
Loading your data path this way ensures that it will read data from the path specified in the `DATA_ROOT` environment variable. If it is not set, it will default to the path: `/data`. This default can be useful in local development when a `DATA_ROOT` environment variable is not set, though it should always be set in production.
:::
