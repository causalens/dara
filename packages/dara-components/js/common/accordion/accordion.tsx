import {
    DynamicComponent,
    type StyledComponentProps,
    type Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import styled, { useTheme } from '@darajs/styled-components';
import { type AccordionItemType, Badge, Accordion as UIAccordion } from '@darajs/ui-components';

const StyledHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    padding-right: 0.5rem;
`;

const StyledAccordion = injectCss(UIAccordion);

function headerRenderer(item: AccordionItemType): JSX.Element {
    // Assume this will be called within the accordion in the same order each time
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const theme = useTheme();
    return (
        <StyledHeader>
            {typeof item.label === 'string' ?
                <span>{item.label}</span>
            :   <DynamicComponent component={item.label} />}
            {item.badge && (
                <Badge color={item.badge.color || theme.colors.primary} height={24} width="10rem">
                    {item.badge.label}
                </Badge>
            )}
        </StyledHeader>
    );
}

const innerRender = (item: AccordionItemType): JSX.Element => {
    return <DynamicComponent component={item.content} />;
};

interface AccordionProps extends StyledComponentProps {
    /** Pass through the className property */
    className: string;
    /** The initial section to open */
    initial: Array<number> | number;
    /** The list of items to display */
    items: Array<AccordionItemType>;
    /** defines whether to only be able to open one item at a time defaults to true */
    multi?: boolean;
    /** The sections that are open */
    value: Variable<Array<number> | number> | Array<number> | number;
}

function Accordion(props: AccordionProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(props.value);
    const onCarouselAction = useAction(props.onchange);

    function handleChange(val: number): void {
        setValue(val);
        onCarouselAction(val);
    }

    return (
        <StyledAccordion
            $rawCss={css}
            className={props.className}
            headerRenderer={headerRenderer}
            initialOpenItems={props.initial}
            innerRenderer={innerRender}
            items={props.items}
            multi={props.multi}
            onChange={handleChange as any}
            style={style}
            value={value}
        />
    );
}

export default Accordion;
