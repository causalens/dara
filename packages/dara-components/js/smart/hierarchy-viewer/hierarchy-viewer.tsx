import {
    type Action,
    type StyledComponentProps,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { type HierarchyNode, HierarchyViewer as UiHierarchyViewer } from '@darajs/ui-hierarchy-viewer';

interface HierarchyViewerProps extends StyledComponentProps {
    allow_leaf_click: boolean;
    allow_parent_click: boolean;
    hierarchy: HierarchyNode;
    on_click_node: Action;
}

const StyledHierarchyViewer = injectCss(UiHierarchyViewer);

/**
 * A component for displaying a weighted hierarchy viewer component
 *
 * @param {HierarchyViewerProps} props - the component props
 */
function HierarchyViewer(props: HierarchyViewerProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const hierarchy = useVariable(props.hierarchy)[0];
    const onClick = useAction(props.on_click_node);

    return (
        <StyledHierarchyViewer
            id={props.id_}
            $rawCss={css}
            allowLeafClick={props.allow_leaf_click}
            allowParentClick={props.allow_parent_click}
            data={hierarchy}
            onClick={onClick}
            style={style}
        />
    );
}

export default HierarchyViewer;
