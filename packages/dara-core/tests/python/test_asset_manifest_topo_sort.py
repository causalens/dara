"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import pytest

from dara.core.base_definitions import AssetManifest


def create_manifest(depends_on=None):
    """Helper to create a mock AssetManifest with minimal required fields."""
    return AssetManifest(
        base_path='/mock/path',
        autojs_assets=[],
        common_assets=[],
        tag_order=[],
        depends_on=depends_on or [],
    )


def test_empty_manifests():
    """Test sorting with no manifests."""
    result = AssetManifest.topo_sort({})
    assert result == {}


def test_single_manifest_no_deps():
    """Test sorting with a single manifest with no dependencies."""
    manifests = {'pkg1': create_manifest()}
    result = AssetManifest.topo_sort(manifests)
    assert list(result.keys()) == ['pkg1']


def test_multiple_manifests_no_deps():
    """Test sorting with multiple manifests with no dependencies."""
    manifests = {
        'pkg1': create_manifest(),
        'pkg2': create_manifest(),
        'pkg3': create_manifest(),
    }
    result = AssetManifest.topo_sort(manifests)
    # All packages should be present
    assert set(result.keys()) == {'pkg1', 'pkg2', 'pkg3'}


def test_linear_dependency_chain():
    """Test sorting with a linear dependency chain: C depends on B, B depends on A."""
    manifests = {
        'pkg_c': create_manifest(depends_on=['pkg_b']),
        'pkg_b': create_manifest(depends_on=['pkg_a']),
        'pkg_a': create_manifest(),
    }
    result = AssetManifest.topo_sort(manifests)
    result_list = list(result.keys())

    # pkg_a should come before pkg_b, pkg_b before pkg_c (dependencies first)
    assert result_list.index('pkg_a') < result_list.index('pkg_b')
    assert result_list.index('pkg_b') < result_list.index('pkg_c')


def test_multiple_dependencies():
    """Test sorting where one package depends on multiple others."""
    manifests = {
        'pkg_d': create_manifest(depends_on=['pkg_b', 'pkg_c']),
        'pkg_c': create_manifest(depends_on=['pkg_a']),
        'pkg_b': create_manifest(depends_on=['pkg_a']),
        'pkg_a': create_manifest(),
    }
    result = AssetManifest.topo_sort(manifests)
    result_list = list(result.keys())

    # pkg_a should come before all others
    assert result_list.index('pkg_a') < result_list.index('pkg_b')
    assert result_list.index('pkg_a') < result_list.index('pkg_c')
    assert result_list.index('pkg_a') < result_list.index('pkg_d')

    # pkg_b and pkg_c should come before pkg_d
    assert result_list.index('pkg_b') < result_list.index('pkg_d')
    assert result_list.index('pkg_c') < result_list.index('pkg_d')


def test_diamond_dependency():
    """Test sorting with diamond dependency: D depends on B,C which both depend on A."""
    manifests = {
        'pkg_d': create_manifest(depends_on=['pkg_b', 'pkg_c']),
        'pkg_c': create_manifest(depends_on=['pkg_a']),
        'pkg_b': create_manifest(depends_on=['pkg_a']),
        'pkg_a': create_manifest(),
    }
    result = AssetManifest.topo_sort(manifests)
    result_list = list(result.keys())

    # pkg_a must be first
    assert result_list[0] == 'pkg_a'
    # pkg_d must be last
    assert result_list[-1] == 'pkg_d'


def test_real_world_example():
    """Test with a realistic example like dara.core, dara.components."""
    manifests = {
        'dara.components': create_manifest(depends_on=['dara.core']),
        'dara.core': create_manifest(),
        'custom.app': create_manifest(depends_on=['dara.components', 'dara.core']),
    }
    result = AssetManifest.topo_sort(manifests)
    result_list = list(result.keys())

    # dara.core should come first
    assert result_list[0] == 'dara.core'
    # dara.components should come before custom.app
    assert result_list.index('dara.components') < result_list.index('custom.app')


def test_non_existent_dependency_ignored():
    """Test that dependencies on packages not in the manifest dict are ignored."""
    manifests = {
        'pkg_b': create_manifest(depends_on=['pkg_a', 'pkg_non_existent']),
        'pkg_a': create_manifest(),
    }
    # Should not raise an error, just ignore the non-existent dependency
    result = AssetManifest.topo_sort(manifests)
    result_list = list(result.keys())

    assert result_list.index('pkg_a') < result_list.index('pkg_b')


def test_cyclic_dependency_simple():
    """Test that a simple cyclic dependency raises an error."""
    manifests = {
        'pkg_a': create_manifest(depends_on=['pkg_b']),
        'pkg_b': create_manifest(depends_on=['pkg_a']),
    }
    with pytest.raises(ValueError, match='Cyclic dependency detected'):
        AssetManifest.topo_sort(manifests)


def test_cyclic_dependency_three_packages():
    """Test that a cycle with three packages raises an error: A -> B -> C -> A."""
    manifests = {
        'pkg_a': create_manifest(depends_on=['pkg_c']),
        'pkg_b': create_manifest(depends_on=['pkg_a']),
        'pkg_c': create_manifest(depends_on=['pkg_b']),
    }
    with pytest.raises(ValueError, match='Cyclic dependency detected'):
        AssetManifest.topo_sort(manifests)


def test_cyclic_dependency_with_self_reference():
    """Test that a package depending on itself raises an error."""
    manifests = {
        'pkg_a': create_manifest(depends_on=['pkg_a']),
    }
    with pytest.raises(ValueError, match='Cyclic dependency detected'):
        AssetManifest.topo_sort(manifests)


def test_complex_graph_with_multiple_paths():
    """Test a more complex dependency graph with multiple paths."""
    manifests = {
        'pkg_f': create_manifest(depends_on=['pkg_d', 'pkg_e']),
        'pkg_e': create_manifest(depends_on=['pkg_c']),
        'pkg_d': create_manifest(depends_on=['pkg_b', 'pkg_c']),
        'pkg_c': create_manifest(depends_on=['pkg_a']),
        'pkg_b': create_manifest(depends_on=['pkg_a']),
        'pkg_a': create_manifest(),
    }
    result = AssetManifest.topo_sort(manifests)
    result_list = list(result.keys())

    # pkg_a must be first
    assert result_list[0] == 'pkg_a'
    # pkg_f must be last
    assert result_list[-1] == 'pkg_f'

    # Validate all dependency orderings
    assert result_list.index('pkg_a') < result_list.index('pkg_b')
    assert result_list.index('pkg_a') < result_list.index('pkg_c')
    assert result_list.index('pkg_b') < result_list.index('pkg_d')
    assert result_list.index('pkg_c') < result_list.index('pkg_d')
    assert result_list.index('pkg_c') < result_list.index('pkg_e')
    assert result_list.index('pkg_d') < result_list.index('pkg_f')
    assert result_list.index('pkg_e') < result_list.index('pkg_f')


def test_preserves_manifest_objects():
    """Test that the sorted result contains the same manifest objects."""
    manifest_a = create_manifest()
    manifest_b = create_manifest(depends_on=['pkg_a'])
    manifests = {
        'pkg_a': manifest_a,
        'pkg_b': manifest_b,
    }
    result = AssetManifest.topo_sort(manifests)

    assert result['pkg_a'] is manifest_a
    assert result['pkg_b'] is manifest_b


def test_independent_subgraphs():
    """Test sorting with multiple independent dependency subgraphs."""
    manifests = {
        # First subgraph
        'pkg_a': create_manifest(),
        'pkg_b': create_manifest(depends_on=['pkg_a']),
        # Second independent subgraph
        'pkg_x': create_manifest(),
        'pkg_y': create_manifest(depends_on=['pkg_x']),
    }
    result = AssetManifest.topo_sort(manifests)
    result_list = list(result.keys())

    # Within each subgraph, dependencies should be respected
    assert result_list.index('pkg_a') < result_list.index('pkg_b')
    assert result_list.index('pkg_x') < result_list.index('pkg_y')
