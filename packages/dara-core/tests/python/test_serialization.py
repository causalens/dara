from typing import Mapping, Optional, List, Tuple, Dict, Union
from pydantic import BaseModel
from dara.core.base_definitions import annotation_has_base_model
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import Variable, AnyVariable

def test_annotation_has_base_model():
    valid_types = [
            Optional[Variable[int]],
            List[Variable[int]],
            List[AnyVariable],
            Tuple[Variable[int], int],
            Dict[str, Variable[int]],
            Union[Variable, ComponentInstance],
            Mapping[str, Variable[int]],
            Variable,
            ComponentInstance,
            Optional[Mapping[str, Variable[int]]],
    ]
    for typ in valid_types:
        assert annotation_has_base_model(typ)
