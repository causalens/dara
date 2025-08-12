import {
    type ComponentInstance,
    DynamicComponent,
    type StyledComponentProps,
    type Variable,
    injectCss,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';

interface RenderProp {
    margin?: string;
    padding?: string;
    position?: string;
    render: boolean;
}

const OverlayWrapper = injectCss(styled.div<RenderProp>`
    position: absolute;
    z-index: 2000;
    inset: ${(props) => (props.position?.includes('top') ? '0' : null)}
        ${(props) => (props.position?.includes('right') ? '0' : null)}
        ${(props) => (props.position?.includes('bottom') ? '0' : null)}
        ${(props) => (props.position?.includes('left') ? '0' : null)};

    display: ${(props) => (props.render ? 'inline-flex' : 'none')};
    flex-direction: column;

    max-width: 100%;
    max-height: 100%;
    margin: ${(props) => props.margin};
    padding: ${(props) => (props.padding ? props.padding : '1rem')};
`);

interface OverlayProps extends StyledComponentProps {
    // The children to be rendered within the overlay
    children: Array<ComponentInstance>;
    // The margin property to shift the overlay in any direction
    margin?: string;
    // The padding around the overlay elements; can also be passed as individual side's padding in css shorthand format
    padding?: string;
    // The position of the overlay; can be top-left, top-right, bottom-left, bottom-right
    position?: string;

    // The show flag, tells the overlay whether or not to display
    show: Variable<boolean>;
}

/**
 * The overlay component accepts a set of children and renders them as an overlay depending on the value of the render flag.
 *
 * @param props the component props
 */
function Overlay(props: OverlayProps): JSX.Element {
    const [styles, css] = useComponentStyles(props);
    const [show] = useVariable(props.show || true);
    return (
        <OverlayWrapper
            $rawCss={css}
            margin={props.margin}
            padding={props.padding}
            position={props.position}
            render={show}
            style={styles}
        >
            {props.children.map((child, idx) => (
                <DynamicComponent component={child} key={`overlay-${idx}-${child.uid}`} />
            ))}
        </OverlayWrapper>
    );
}

export default Overlay;
