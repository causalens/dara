import json
import sys
from collections.abc import Mapping
from types import ModuleType
from typing import Optional, Union

import pytest
from pydantic import SerializeAsAny

from dara.core.base_definitions import annotation_has_base_model
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import AnyVariable, Variable


def test_annotation_has_base_model():
    valid_types = [
        Optional[Variable[int]],
        list[Variable[int]],
        list[AnyVariable],
        tuple[Variable[int], int],
        dict[str, Variable[int]],
        Union[Variable, ComponentInstance],
        Mapping[str, Variable[int]],
        Variable,
        ComponentInstance,
        Optional[Mapping[str, Variable[int]]],
    ]
    for typ in valid_types:
        assert annotation_has_base_model(typ)


@pytest.fixture(params=[False, True], ids=['runtime-annotations', 'future-annotations'])
def serialization_models(request, monkeypatch):
    """Compile the same models with eager/deferred annotations and stringified annotations."""
    module = ModuleType('serialization_models')
    monkeypatch.setitem(sys.modules, module.__name__, module)
    source = """
from typing import ClassVar, Generic, Optional, TypeVar
from pydantic import BaseModel
from dara.core.base_definitions import DaraBaseModel

class Base(BaseModel):
    value: int

class Sub(Base):
    extra: str

class Holder(DaraBaseModel):
    item: Base
    items: list[Base]
    constant: ClassVar[Base] = Base(value=0)

class Inherited(Holder):
    pass

class Empty(DaraBaseModel):
    pass

class Node(DaraBaseModel):
    child: Optional['Node'] = None

class SubNode(Node):
    extra: str

class Before(DaraBaseModel):
    items: list[Later]

class Later(DaraBaseModel):
    before: Optional['Before'] = None

class SubLater(Later):
    extra: str

T = TypeVar('T')

class GenericHolder(DaraBaseModel, Generic[T]):
    item: T
"""
    # Quoted forward references are required before Python 3.14 without the future import.
    if sys.version_info < (3, 14) and not request.param:
        source = source.replace('list[Later]', "list['Later']")
    if request.param:
        source = 'from __future__ import annotations\n' + source
    exec(compile(source, '<serialization_models>', 'exec', dont_inherit=True), module.__dict__)
    return module


def test_model_annotation_rewriting(serialization_models):
    """Rewritten annotations preserve subclass fields, inherited fields and ClassVars."""
    models = serialization_models
    # String annotations have always required an explicit rebuild to apply SerializeAsAny.
    models.Holder.model_rebuild()
    models.Inherited.model_rebuild()
    item = models.Sub(value=1, extra='subclass')
    expected = {'item': {'value': 1, 'extra': 'subclass'}, 'items': [{'value': 1, 'extra': 'subclass'}]}
    for model in (models.Holder, models.Inherited):
        instance = model(item=item, items=[item])
        assert instance.model_dump() == expected
        assert json.loads(instance.model_dump_json()) == expected
        assert model.constant == models.Base(value=0)
        assert 'constant' not in model.model_fields
    assert models.Empty().model_dump() == {}


def test_deferred_annotations_preserve_serialize_as_any(serialization_models):
    """Pydantic must see the rewritten mapping before any explicit rebuild on Python 3.14."""
    models = serialization_models
    if isinstance(models.Holder.__annotations__['item'], str):
        pytest.skip('Stringified annotations use the existing explicit rebuild path')
    assert any(isinstance(meta, SerializeAsAny) for meta in models.Holder.model_fields['item'].metadata)
    item = models.Sub(value=1, extra='subclass')
    instance = models.Holder(item=item, items=[item])
    assert instance.model_dump()['item']['extra'] == 'subclass'
    assert json.loads(instance.model_dump_json())['items'][0]['extra'] == 'subclass'
    if sys.version_info >= (3, 14):
        import annotationlib

        annotations = annotationlib.get_annotations(models.Holder, format=annotationlib.Format.FORWARDREF)
        assert annotations == models.Holder.__annotations__
        assert annotations['item'] != models.Base


def test_recursive_model_serialization(serialization_models):
    """Self references and mutually recursive forward references survive resolution and rebuilding."""
    models = serialization_models
    models.Node.model_rebuild()
    node = models.Node(child=models.SubNode(extra='child'))
    assert node.model_dump() == {'child': {'child': None, 'extra': 'child'}}
    assert json.loads(node.model_dump_json()) == node.model_dump()
    models.Before.model_rebuild()
    models.Later.model_rebuild()
    instance = models.Before(items=[models.SubLater(extra='later')])
    assert instance.model_dump() == {'items': [{'before': None, 'extra': 'later'}]}
    assert json.loads(instance.model_dump_json()) == instance.model_dump()


def test_generic_model_serialization(serialization_models):
    """Generic specialization must retain subclass fields in both direct and nested serialization."""
    models = serialization_models
    item = models.Sub(value=1, extra='generic')
    instance = models.GenericHolder[models.Base](item=item)
    assert instance.model_dump() == {'item': {'value': 1, 'extra': 'generic'}}
    assert json.loads(instance.model_dump_json()) == instance.model_dump()
    nested = models.GenericHolder[models.GenericHolder[models.Base]](item=instance)
    assert nested.model_dump() == {'item': {'item': {'value': 1, 'extra': 'generic'}}}
    assert json.loads(nested.model_dump_json()) == nested.model_dump()
