import { getDeps } from '../../js/shared/interactivity/derived-variable';
import { type ResolvedDerivedVariable } from '../../js/types';

describe('Deps helpers', () => {
    it('`getDeps` should correctly build deps array', () => {
        // Note: Some objects intentionally set `deps` to undefined to test the behavior where
        // undefined deps means "include all values".
        const values: Array<Partial<ResolvedDerivedVariable> | number> = [
            1,
            {
                type: 'derived',
                uid: '1st-level',
                nested: [],
                deps: undefined, // undefined means include all values
                values: [
                    {
                        type: 'derived',
                        uid: '2nd-level',
                        nested: [],
                        deps: undefined, // undefined means include all values
                        values: [
                            {
                                // Include indexes 0,2 - ignore the 99
                                deps: [0, 2],
                                type: 'derived',
                                uid: '3rd-level',
                                nested: [],
                                values: [5, 99, 6],
                            },
                            4,
                        ],
                    },
                    2,
                ],
            },
            {
                // Deps is [] so replace this whole variable with empty array
                deps: [],
                type: 'derived',
                uid: '1st-level-ignored',
                nested: [],
                values: [0, 1, 2, 3],
            },
            3,
        ];

        const expectedDeps = [1, [5, 6, 4, 2], [], 3];
        const deps = getDeps(values);
        expect(deps).toEqual(expectedDeps);
    });
});
