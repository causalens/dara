import {
    ComponentInstance,
    DisplayCtx,
    DynamicComponent,
    StyledComponentProps,
    injectCss,
    useComponentStyles,
} from '@darajs/core';
import styled, { DefaultTheme } from '@darajs/styled-components';

import { ComponentType } from '../constants';

interface AnchorProps extends StyledComponentProps {
    children: Array<ComponentInstance>;
    /** Passthrough standard react class name property */
    className: string;
    /** Whether to remove all styling from the anchor */
    clean: boolean;
    /** Anchor tag URL */
    href: string;
    /** ID to attach to the anchor */
    name: string;
    /** Whether to open the link in a new tab */
    new_tab: boolean;
}

const CustomA = styled.a<DefaultTheme>`
    :visited {
        color: ${(props) => props.theme.colors.secondary};
    }
    :link {
        color: ${(props) => props.theme.colors.primary};
    }
    :hover {
        color: ${(props) => props.theme.colors.primaryHover};
    }
    :active {
        color: ${(props) => props.theme.colors.primaryDown};
    }
`;
const StyledA = injectCss(CustomA);

function Anchor(props: AnchorProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    return (
        <StyledA
            $rawCss={css}
            className={props.clean ? 'report-clean-anchor' : props.className}
            href={props.href}
            id={props.name}
            rel="noreferrer"
            style={style}
            target={props.new_tab ? '_blank' : '_self'}
        >
            <DisplayCtx.Provider value={{ component: ComponentType.ANCHOR, direction: 'horizontal' }}>
                {props.children.map((child, idx) => (
                    <DynamicComponent component={child} key={`stack-${idx}-${child.name}`} />
                ))}
            </DisplayCtx.Provider>
        </StyledA>
    );
}

export default Anchor;
