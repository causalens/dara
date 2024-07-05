import { fireEvent, render } from '@testing-library/react';

import { ThemeProvider, theme } from '@darajs/styled-components';

import NodeHierarchyBuilder, { NodeHierarchyBuilderProps } from '../src/node-hierarchy-builder/node-hierarchy-builder';

function RenderHierarchyBuilder(props: NodeHierarchyBuilderProps): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <NodeHierarchyBuilder {...props} />
        </ThemeProvider>
    );
}

function dragElement(element: Element, target: Element): void {
    fireEvent.dragStart(element);
    fireEvent.dragEnter(target);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
}

describe('NodeHierarchyBuilder', () => {
    it('should render initial state correctly', () => {
        const nodes = [
            ['11', '12'],
            ['21', '22', '23'],
            ['31', '32', '33', '34'],
        ];
        const { container } = render(<RenderHierarchyBuilder nodes={nodes} />);

        // Check total count of nodes
        const draggableElements = container.querySelectorAll('[draggable="true"]');
        expect(draggableElements.length).toBe(9);

        // Verify they are laid out correctly
        expect(draggableElements[0].parentElement.childElementCount).toBe(2);
        expect(draggableElements[2].parentElement.childElementCount).toBe(3);
        expect(draggableElements[5].parentElement.childElementCount).toBe(4);
    });

    it('should add layers correctly', () => {
        const nodes = [
            ['11', '12'],
            ['21', '22', '23'],
            ['31', '32', '33', '34'],
        ];
        let result: string[][] = nodes;
        const updateHandler = (newNodes: string[][]): void => {
            result = newNodes;
        };

        const { getAllByTestId } = render(<RenderHierarchyBuilder nodes={nodes} onUpdate={updateHandler} />);

        const dividerButtons = getAllByTestId('divider-button');
        const addAboveButton = dividerButtons[0];
        fireEvent.click(addAboveButton);
        expect(result).toEqual([[], ...nodes]);

        const addBelowButton = dividerButtons[dividerButtons.length - 1];
        fireEvent.click(addBelowButton);
        expect(result).toEqual([[], ...nodes, []]);

        // add layer after first layer
        const newDividerButtons = getAllByTestId('divider-button');
        const afterFirstLayerButton = newDividerButtons[1];
        fireEvent.click(afterFirstLayerButton);
        expect(result).toEqual([[], [], ...nodes, []]);
    });

    it('should move nodes between layers correctly', () => {
        const nodes = [
            ['11', '12'],
            ['21', '22', '23'],
            ['31', '32', '33', '34'],
        ];

        let result: string[][] = nodes;
        const updateHandler = (newNodes: string[][]): void => {
            result = newNodes;
        };

        const { container } = render(<RenderHierarchyBuilder nodes={nodes} onUpdate={updateHandler} />);

        const nodeElements = container.querySelectorAll('[draggable="true"]');
        expect(nodeElements[0].children[0].innerHTML).toEqual('11');

        const secondLayer = nodeElements[2].parentElement;

        dragElement(nodeElements[0], secondLayer);

        expect(result).toEqual([['12'], ['21', '22', '23', '11'], ['31', '32', '33', '34']]);
    });

    it('should delete a layer and move nodes a layer down correctly', () => {
        const nodes = [
            ['11', '12'],
            ['21', '22', '23'],
            ['31', '32', '33', '34'],
        ];

        let result: string[][] = nodes;
        const updateHandler = (newNodes: string[][]): void => {
            result = newNodes;
        };

        const { container } = render(<RenderHierarchyBuilder nodes={nodes} onUpdate={updateHandler} />);

        const svgButtons = container.querySelectorAll('svg');
        // 6 - collapse for each and crosses for each - + 4 dividers
        expect(svgButtons.length).toBe(10);

        // Delete button is third in DOM - right after first divider and chevron
        const [, , deleteButton] = svgButtons;

        fireEvent.click(deleteButton);

        expect(result).toEqual([
            ['21', '22', '23', '11', '12'],
            ['31', '32', '33', '34'],
        ]);
    });

    it('should delete the last layer and move nodes a layer up correctly', () => {
        const nodes = [
            ['11', '12'],
            ['21', '22', '23'],
            ['31', '32', '33', '34'],
        ];

        let result: string[][] = nodes;
        const updateHandler = (newNodes: string[][]): void => {
            result = newNodes;
        };

        const { container } = render(<RenderHierarchyBuilder nodes={nodes} onUpdate={updateHandler} />);

        const svgButtons = container.querySelectorAll('svg');
        // 5 - collapse for each and crosses for each except last layer - + 4 dividers
        expect(svgButtons.length).toBe(10);

        // Delete button is second-last in DOM (before last divider)
        const deleteButton = svgButtons[svgButtons.length - 2];

        fireEvent.click(deleteButton);

        expect(result).toEqual([
            ['11', '12'],
            ['21', '22', '23', '31', '32', '33', '34'],
        ]);
    });
});
