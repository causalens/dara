import { getDeps } from '../../js/shared/interactivity/derived-variable';
import { ResolvedDerivedVariable } from '../../js/types';

describe('Deps helpers', () => {
    it('`getDeps` should correctly build deps array', () => {
        const values = [
            1,
            {
                type: 'derived',
                uid: '1st-level',
                values: [
                    {
                        type: 'derived',
                        uid: '2nd-level',
                        values: [
                            {
                                // Include indexes 0,2 - ignore the 99
                                deps: [0, 2],

                                type: 'derived',

                                uid: '3rd-level',

                                values: [5, 99, 6],
                            },
                            4,
                        ],
                    } as ResolvedDerivedVariable,
                    2,
                ],
            } as ResolvedDerivedVariable,
            {
                // Deps is [] so replace this whole variable with empty array
                deps: [],

                type: 'derived',
                uid: '1st-level-ignored',

                values: [0, 1, 2, 3],
            } as ResolvedDerivedVariable,
            3,
        ];

        const expectedDeps = [1, [5, 6, 4, 2], [], 3];
        const deps = getDeps(values);
        expect(deps).toEqual(expectedDeps);
    });
});
