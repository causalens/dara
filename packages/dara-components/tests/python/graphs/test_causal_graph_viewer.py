from cai_causal_graph import CausalGraph
from fastapi.encoders import jsonable_encoder

from dara.components.graphs import CausalGraphViewer
from dara.core import Variable


def test_serialize():
    cg = CausalGraph()
    cgv = CausalGraphViewer(causal_graph=cg)
    encoded = jsonable_encoder(cgv)

    assert encoded['props']['causal_graph'] == cg.to_dict()


def test_serialize_variable():
    """Ensure that a Variable can be passed in as the causal_graph and serializes with no issue"""
    cg = CausalGraph()
    cgv = CausalGraphViewer(causal_graph=Variable(default=cg))
    encoded = jsonable_encoder(cgv)

    assert encoded['props']['causal_graph']['default'] == cg.to_dict()
