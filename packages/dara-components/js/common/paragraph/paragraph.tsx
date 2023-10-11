import {
    ComponentInstance,
    DisplayCtx,
    DynamicComponent,
    StyledComponentProps,
    injectCss,
    useComponentStyles,
} from '@darajs/core';

import { ComponentType } from '../constants';

interface ParagraphProps extends StyledComponentProps {
    align: 'start' | 'end' | 'left' | 'right' | 'center' | 'justify' | 'match-parent';
    children: Array<ComponentInstance>;
    className: string;
}

const StyledP = injectCss('p');

function Paragraph(props: ParagraphProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    return (
        <StyledP $rawCss={css} className={props.className} style={{ textAlign: props.align, ...style }}>
            <DisplayCtx.Provider value={{ component: ComponentType.PARAGRAPH, direction: 'horizontal' }}>
                {props.children.map((child, idx) => (
                    <DynamicComponent component={child} key={`stack-${idx}-${child.name}`} />
                ))}
            </DisplayCtx.Provider>
        </StyledP>
    );
}

export default Paragraph;
