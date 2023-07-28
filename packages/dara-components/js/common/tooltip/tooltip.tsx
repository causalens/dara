import {
    ComponentInstance,
    DynamicComponent,
    StyledComponentProps,
    Variable,
    injectCss,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { Tooltip as UITooltip } from '@darajs/ui-components';

import Stack from '../stack/stack';

interface TooltipProps extends StyledComponentProps {
    /** Content to render in the tooltip, can be any react renderable content */
    content: string | Variable<any> | ComponentInstance;
    /** Parameter to determine where to place the tooltip with respect to the children */
    placement?: 'top' | 'bottom' | 'auto' | 'left' | 'right';
    /** Parameter that controls the style of the tooltip */
    styling: 'default' | 'error';
}

const StyledTooltip = injectCss(UITooltip);

/**
 * A component that wraps child components in the tooltip component. Content is displayed in the tooltip, with
 * the styling specified and positioned relative to the child at the given placement.
 *
 * @param {TooltipProps} props - the component props
 */
function Tooltip(props: TooltipProps): JSX.Element {
    const [styles, css] = useComponentStyles(props);
    const [content] = useVariable(props.content);

    return (
        <StyledTooltip
            $rawCss={css}
            content={
                typeof content === 'string' ? (
                    content
                ) : (
                    <DynamicComponent component={content} key={`tooltip-${(content as ComponentInstance).name}`} />
                )
            }
            placement={props.placement}
            style={styles}
            styling={props.styling}
        >
            {/* Python side makes sure there's only one child and it is Stack */}
            <Stack {...props.children[0].props} />
        </StyledTooltip>
    );
}

export default Tooltip;
