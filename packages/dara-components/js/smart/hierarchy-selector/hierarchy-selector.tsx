import { type StyledComponentProps, type Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import { type HierarchyNode, HierarchySelector as UIHierarchySelector } from '@darajs/ui-components';

interface HierarchySelectorProps extends StyledComponentProps {
    /** Allow selection of categories from the selector */
    allow_category_select: boolean;
    /** Allow selection of leaves from the selector */
    allow_leaf_select: boolean;
    /** A hierarchy of nodes */
    hierarchy: HierarchyNode;
    /** Whether to open all trees from the start */
    open_all: boolean;
    /** The selectedItem variable to read and update */
    value: Variable<string>;
}

const StyledHierarchySelector = injectCss(UIHierarchySelector);

/**
 * A component for rendering a hierarchy selector. Requires a node interface that defines the hierarchy and a value
 * that is updated when a node is selected.
 *
 * @param {HierarchySelectorProps} props - the component props
 */
function HierarchySelector(props: HierarchySelectorProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [selected, setValue] = useVariable(props.value);
    return (
        <StyledHierarchySelector
            id={props.id_}
            $rawCss={css}
            allowSelectCategory={props.allow_category_select}
            allowSelectLeaf={props.allow_leaf_select}
            onSelect={setValue}
            rootNode={props.hierarchy}
            rootOpen={props.open_all}
            selected={selected}
            style={style}
        />
    );
}

export default HierarchySelector;
