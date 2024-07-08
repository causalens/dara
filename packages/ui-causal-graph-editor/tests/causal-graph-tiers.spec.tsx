import { getTieredLayoutProperties } from '../src/shared/graph-layout/fcose-layout';
import { causalGraphParser } from '../src/shared/parsers';
import { FRAUD, SIMPLE } from './mocks/graphs';

const groupA = [
    'CPI',
    'Gender Value=F',
    'Location Value=EC',
    'Location Value=SE',
    'Location Value=SW',
    'Unemployment Rate',
];
const groupB = ['Crime Rate', 'Salary'];
const groupC = [
    'Claim Type Value=Liability',
    'Collision Type Value=Front',
    'Marital Status Value=Married',
    'Occupation Value=Professional',
];
const groupD = [
    'Age',
    'Authority Contacted',
    'Car Value',
    'Education Level Value=Higher',
    'No-Claims Years',
    'Number of Children',
    'Previous Claims',
    'Previous Claims Value',
    'Total Claim',
    'Years with License',
];
const groupE = ['Fraud'];

const tieredFraud = [groupD, groupA, groupC, groupB, groupE];

const invalidOrderGraph = {
    ...SIMPLE,
    nodes: {
        ...SIMPLE.nodes,
        A: {
            ...SIMPLE.nodes.A,
            meta: {
                ...SIMPLE.nodes.A.meta,
                group: 'group1',
                order: 'foo',
            },
        },
        B: {
            ...SIMPLE.nodes.B,
            meta: {
                ...SIMPLE.nodes.B.meta,
                group: 'group1',
                order: 2,
            },
        },
    },
};

describe('CausalGraphTiers', () => {
    describe('Fcose Layout', () => {
        it('Tier of tiers produces correct relative placements horizontal', () => {
            const parsedGraph = causalGraphParser(SIMPLE);
            const tiers = [['A'], ['B'], ['C', 'D']];
            const tiersLayout = getTieredLayoutProperties(parsedGraph, tiers, 'horizontal', 100);

            expect(tiersLayout).toHaveProperty('alignmentConstraint', [['A'], ['B'], ['C', 'D']]);
            expect(tiersLayout).toHaveProperty('relativePlacementConstraint', [
                { gap: 100, left: 'A', right: 'B' },
                { gap: 100, left: 'B', right: 'C' },
            ]);
        });
        it('Tier of tiers produces correct relative placements vertical', () => {
            const parsedGraph = causalGraphParser(SIMPLE);
            const tiers = [['A'], ['B'], ['C', 'D']];
            const tiersLayout = getTieredLayoutProperties(parsedGraph, tiers, 'vertical', 100);

            expect(tiersLayout).toHaveProperty('alignmentConstraint', [['A'], ['B'], ['C', 'D']]);
            expect(tiersLayout).toHaveProperty('relativePlacementConstraint', [
                { bottom: 'B', gap: 100, top: 'A' },
                { bottom: 'C', gap: 100, top: 'B' },
            ]);
        });
        it('Throws an error if a value for node order cannot be converted to a number', () => {
            const parsedGraph = causalGraphParser(invalidOrderGraph);
            const tiers = { group: 'meta.group', order_nodes_by: 'meta.order' };
            expect(() => getTieredLayoutProperties(parsedGraph, tiers, 'horizontal', 100)).toThrow(
                'Non-numeric order value encountered for nodes'
            );
        });
        it('Accepts group of tiers config and produces correct tiers', () => {
            const parsedGraph = causalGraphParser(FRAUD);
            const tiers = { group: 'meta.group' };
            const tiersLayout = getTieredLayoutProperties(parsedGraph, tiers, 'horizontal', 100);

            expect(tiersLayout).toHaveProperty('alignmentConstraint', tieredFraud);
            expect(tiersLayout).toHaveProperty('relativePlacementConstraint', [
                { gap: 100, left: 'Age', right: 'CPI' },
                { gap: 100, left: 'CPI', right: 'Claim Type Value=Liability' },
                { gap: 100, left: 'Claim Type Value=Liability', right: 'Crime Rate' },
                { gap: 100, left: 'Crime Rate', right: 'Fraud' },
            ]);
        });
        it('Accepts rank and creates correct relative placements', () => {
            const parsedGraph = causalGraphParser(FRAUD);
            const tiers = { group: 'meta.group', rank: ['a', 'b', 'c', 'd', 'e'] };
            const tiersLayout = getTieredLayoutProperties(parsedGraph, tiers, 'horizontal', 100);

            expect(tiersLayout).toHaveProperty('alignmentConstraint', [groupA, groupB, groupC, groupD, groupE]);
            expect(tiersLayout).toHaveProperty('relativePlacementConstraint', [
                { gap: 100, left: 'CPI', right: 'Crime Rate' },
                { gap: 100, left: 'Crime Rate', right: 'Claim Type Value=Liability' },
                { gap: 100, left: 'Claim Type Value=Liability', right: 'Age' },
                { gap: 100, left: 'Age', right: 'Fraud' },
            ]);
        });
        it('Throws an error if group defined in rank does not exist within node defined groups', () => {
            const parsedGraph = causalGraphParser(FRAUD);
            const tiers = { group: 'meta.group', rank: ['a', 'b', 'c', 'd', 'e', 'f'] };
            expect(() => getTieredLayoutProperties(parsedGraph, tiers, 'horizontal', 100)).toThrow(
                'Group(s) f defined in rank not found within any Nodes'
            );
        });
        it('Accepts order_nodes_by and produces correct relative placements', () => {
            const parsedGraph = causalGraphParser(FRAUD);
            const tiers = { group: 'meta.group', order_nodes_by: 'meta.order', rank: ['a', 'b', 'c', 'd', 'e'] };
            const tiersLayout = getTieredLayoutProperties(parsedGraph, tiers, 'horizontal', 100);

            expect(tiersLayout).toHaveProperty('alignmentConstraint', [groupA, groupB, groupC, groupD, groupE]);
            expect(tiersLayout).toHaveProperty('relativePlacementConstraint', [
                { bottom: 'Location Value=SE', gap: 100, top: 'Location Value=EC' },
                { bottom: 'Location Value=SW', gap: 100, top: 'Location Value=SE' },
                { gap: 100, left: 'CPI', right: 'Crime Rate' },
                { gap: 100, left: 'Crime Rate', right: 'Claim Type Value=Liability' },
                { gap: 100, left: 'Claim Type Value=Liability', right: 'Age' },
                { gap: 100, left: 'Age', right: 'Fraud' },
            ]);
        });
    });
});
