from fastapi.encoders import jsonable_encoder

from cai_causal_graph import CausalGraph
from cai_causal_graph.graph_components import Node
from dara.components.graphs import VisualEdgeEncoder
from dara.core import Variable


def test_serialize():
    # as strings
    encoder = VisualEdgeEncoder(nodes=['Age', 'Unemployment', 'Education', 'Income'])
    encoded = jsonable_encoder(encoder)

    assert encoded['props']['nodes'] == ['Age', 'Unemployment', 'Education', 'Income']

    # as dict of [str, Node]
    encoder = VisualEdgeEncoder(
        nodes={
            'Age': Node('Age'),
            'Unemployment': Node('Unemployment'),
            'Education': Node('Education'),
            'Income': Node('Income'),
        }
    )
    encoded = jsonable_encoder(encoder)

    assert encoded['props']['nodes'] == {
        'Age': encoder.nodes['Age'].to_dict(),
        'Unemployment': encoder.nodes['Unemployment'].to_dict(),
        'Education': encoder.nodes['Education'].to_dict(),
        'Income': encoder.nodes['Income'].to_dict(),
    }

    # as variable with list of strings
    encoder = VisualEdgeEncoder(nodes=Variable(default=['Age', 'Unemployment', 'Education', 'Income']))
    encoded = jsonable_encoder(encoder)

    assert encoded['props']['nodes']['default'] == ['Age', 'Unemployment', 'Education', 'Income']

    # as variable with dict of [str, Node]
    encoder = VisualEdgeEncoder(
        nodes=Variable(
            default={
                'Age': Node('Age'),
                'Unemployment': Node('Unemployment'),
                'Education': Node('Education'),
                'Income': Node('Income'),
            }
        )
    )
    encoded = jsonable_encoder(encoder)

    assert encoded['props']['nodes']['default'] == {
        'Age': encoder.nodes.default['Age'].to_dict(),
        'Unemployment': encoder.nodes.default['Unemployment'].to_dict(),
        'Education': encoder.nodes.default['Education'].to_dict(),
        'Income': encoder.nodes.default['Income'].to_dict(),
    }
