---
title: Retaining Correct Variable Types
---
### Adding Type Annotations to Your Resolver
`dara.core.interactivity.plain_variable.Variable`s are stored in the browser and `dara.core.interactivity.derived_variable.DerivedVariable`s and `py_component`s are calculated on the server. This means that there are times when Dara needs to be able to serialize and deserialize your values.

Static values or `Variable` default values need to be serialized to JSON as part of the component tree - either when included directly in the page or when returned from a `py_component`.

When a user-defined resolver (for `DerivedVariable`s, `py_component`s or action) is called, Dara receives the `Variable` values from the frontend as the serialized JSON. This means your data structures would be turned into primitive types, a `numpy.array` will became a `list`, a `numpy.int8` will become a `int`.

To preserve your original types, Dara provides an encoder system which will attempt to turn the primitive types back into the original type, as long as you annotate your resolver with a type for which an encoder is defined.

Out of the box, Dara comes with encoders for all generic data types in `pandas` and `numpy`. . See [default data types supported](https://github.com/causalens/dara/blob/master/packages/dara-core/dara/core/internal/encoder_registry.py).

You can also add your custom encoder by using `ConfigurationBuilder.add_encoder()`. Notice, if a Variable is a type that can not be serialized by either default encoder handler or custom encoder handle, it can cause serialization to fail.
```python
from dara.core import ConfigurationBuilder

config = ConfigurationBuilder()
config.add_encoder(typ=np.array, serialize=lambda x: x.tolist(), deserialize=lambda y: np.array(y))
```

As mentioned above, the Variable will be serialized into a format that FastApi can handle and you can deserialize it by adding type annotations to your function.
```python
from dara.core import DerivedVariable, Variable,py_component
import numpy

my_var = Variable(default=numpy.array([1,2,3]))

def dv_func(var: numpy.array):
  # The var is a numpy.array, you can use the numpy array function to manipulate data
  return var.sum()

my_der_var = DerivedVariable(dv_func, variables=[my_var])

# Same for py_component
@py_component
def my_component(var: numpy.array):
    return Text(var.tobytes())
my_component(my_var)
```
Current limitation of the serialize/deserialize handler is that the automatic deserialization does not work for action resolvers due to their different API shape.

### Using pydantic
`dara.core.interactivity.plain_variable.Variable`s are stored in the browser and `dara.core.interactivity.derived_variable.DerivedVariable`s and `py_component`s are calculated on the server. When a `Variable` is passed to one of these, it is serialized into a JSON format which becomes a plain `dict` on the server side.

This means that if you pass a class instance of your object to a `Variable` which is then passed into a `DerivedVariable` function, then the function would get an object of type `dict` rather than the class instance you expected.

The recommended solution to keep your variables in their desired types, is to use [`pydantic`](https://pydantic-docs.helpmanual.io/). `pydantic` is a python library that validates data using Python type annotation. It is used heavily in the FastAPI framework as it has built-in support for JSON encoding and decoding when parsing requests and responses.

If your input type extends the [`pydantic.BaseModel`](https://pydantic-docs.helpmanual.io/usage/models/#basic-model-usage) class, `dict` serialization and deserialization will be automatically done for you.

```python
from pydantic import BaseModel

from dara.core import DerivedVariable, Variable

# MyClass extends BaseModel
class MyClass(BaseModel):
  def __init__(self, foo):
      self.foo = 'a'

my_var = Variable(MyClass(foo='a'))

# Gets class instance on resolving function
def bar(some_var: MyClass):
  return some_var.foo

my_der_var = DerivedVariable(bar, variables=[my_var])
```


### Adding a `from_dict` Method to Your Class

If you want to use a class from an external package, using `pydantic` is not suitable.

In this case, you can define a class that inherits from your external class and add a `from_dict` method. Then you can construct your class instance within the function passed to your `DerivedVariable`.

```python
from dara.core import DerivedVariable, Variable
from externalpackage import ExternalClass

# Does not extend BaseModel
class MyClass(ExternalClass):
  def from_dict(self, dict):
      ...

my_var = Variable(MyClass(foo='a'))

# A dict will be passed to resolving function
def bar(some_var: dict):
  # use from_dict to get back MyClass instance
  var_value = MyClass.from_dict(some_var)
  return var_value.foo

my_der_var = DerivedVariable(bar, variables=[my_var])
```
