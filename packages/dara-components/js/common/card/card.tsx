import { transparentize } from 'polished';

import {
    type ComponentInstance,
    DisplayCtx,
    DynamicComponent,
    type LayoutComponentProps,
    type Variable,
    injectCss,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';

interface BaseCardProps {
    accent?: boolean;
}

export const CardDiv = injectCss(styled.div<BaseCardProps>`
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;

    width: 100%;
    padding: 1.5rem;

    color: ${(props) => props.theme.colors.text};

    background: ${(props) =>
        props.accent ?
            `radial-gradient(circle closest-corner at 50% 40%, ${transparentize(
                0.9,
                props.theme.colors.background
            )} 0%, ${transparentize(
                0.8,
                props.theme.colors.blue4
            )} 70%),radial-gradient(circle closest-corner at 20% 150%, ${transparentize(
                0.8,
                props.theme.colors.error
            )} 0%, ${transparentize(0.2, props.theme.colors.blue4)} 230%)`
        :   props.theme.colors.blue1};
    border-radius: 1rem;
    box-shadow: ${(props) => props.theme.shadow.medium};
`);

interface ChildrenWrapperProps {
    hasSubtitle?: boolean;
    hasTitle?: boolean;
}

const ChildrenWrapper = styled.div<ChildrenWrapperProps>`
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    gap: 0.75rem;

    width: 100%;
    height: 100%;
    margin-top: ${(props) => (props.hasTitle || props.hasSubtitle ? '0.75rem' : '0rem')};
`;

const Title = styled.span`
    font-size: 1.2rem;
    font-weight: 400;
    text-align: left;
`;

interface SubtitleProps {
    hasTitle?: boolean;
}

const Subtitle = styled.span<SubtitleProps>`
    margin-top: ${(props) => (props.hasTitle ? '0.25rem' : '0rem')};

    font-size: 1rem;
    font-weight: 400;
    color: ${(props) => props.theme.colors.grey4};
    text-align: left;
`;

interface CardProps extends LayoutComponentProps {
    /** Whether card should be filled with accent gradient or plain */
    accent?: boolean;
    /** Content to be displayed in the main card */
    children: Array<ComponentInstance>;
    /** Optional subtitle for the card */
    subtitle?: string | Variable<string>;
    /** Optional heading for the card */
    title?: string | Variable<string>;
}

/**
 * A card component for displaying content components. Takes a heading, optional subtitle and content to
 * display. Additionally, takes a second content component to display in a side card.
 *
 * @param props - the component props
 */
function Card(props: CardProps): JSX.Element {
    const [title] = useVariable(props.title);
    const [subtitle] = useVariable(props.subtitle);
    const [style, css] = useComponentStyles(props);
    return (
        <CardDiv $rawCss={css} accent={props.accent} style={style}>
            {title && <Title>{title}</Title>}
            {subtitle && <Subtitle hasTitle={props.title !== null}>{subtitle}</Subtitle>}
            <ChildrenWrapper
                data-type="children-wrapper"
                hasSubtitle={props.subtitle !== null}
                hasTitle={props.title !== null}
                style={{
                    alignItems: props.align,
                    justifyContent: props.justify,
                }}
            >
                <DisplayCtx.Provider value={{ component: 'card', direction: 'vertical' }}>
                    {props.children.map((child: ComponentInstance, idx: number) => (
                        <DynamicComponent component={child} key={`card-${idx}-${child.name}`} />
                    ))}
                </DisplayCtx.Provider>
            </ChildrenWrapper>
        </CardDiv>
    );
}

export default Card;
