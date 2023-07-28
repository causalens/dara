---
title: Retaining Correct Variable Types
---

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