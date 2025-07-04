from dara.core import DerivedVariable


def test_ignores_key_order():
    first_args = [0, {'type': 'derived', 'force_key': None, 'values': [{'value': 0, 'force_key': None}]}, 'null']
    second_args = [
        0,
        {
            'type': 'derived',
            'values': [
                {
                    'force_key': None,
                    'value': 0,
                }
            ],
            'force_key': None,
        },
        'null',
    ]

    first_cache_key = DerivedVariable._get_cache_key(*first_args, uid='test_uid')
    second_cache_key = DerivedVariable._get_cache_key(*second_args, uid='test_uid')

    assert first_cache_key == second_cache_key
