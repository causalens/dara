from dara.core import DerivedVariable


def test_ignores_key_order():
    first_args = [0, {'type': 'derived', 'force': False, 'values': [{'value': 0, 'force': False}]}, 'null']
    second_args = [
        0,
        {
            'type': 'derived',
            'values': [
                {
                    'force': False,
                    'value': 0,
                }
            ],
            'force': False,
        },
        'null',
    ]

    first_cache_key = DerivedVariable._get_cache_key(*first_args, uid='test_uid')
    second_cache_key = DerivedVariable._get_cache_key(*second_args, uid='test_uid')

    assert first_cache_key == second_cache_key
