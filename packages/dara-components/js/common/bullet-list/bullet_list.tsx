import { type StyledComponentProps, type Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';

interface BulletListProps extends StyledComponentProps {
    /** Content to be displayed in the bullet list */
    items: Variable<Array<string>> | Array<string>;
    /** Parameter specifying if list is ordered or not */
    numbered: boolean;
}

const StyledTag = injectCss('div');

/**
 * A component for creating bullet point lists. Takes an array of inputs to be displayed and an optional
 * parameter that specifies whether the list should be ordered or not.
 *
 * @param props - the component props
 */
function BulletList(props: BulletListProps): JSX.Element {
    const items = useVariable(props.items)[0];
    const [style, css] = useComponentStyles(props);
    const tag = (props.numbered ? 'ol' : 'ul') as keyof JSX.IntrinsicElements;
    return (
        <StyledTag $rawCss={css} as={tag} style={style} id={props.id_}>
            {items.map((item: string, index: number) => (
                <li key={`li-${index}`} style={{ textAlign: 'left' }}>
                    {item}
                </li>
            ))}
        </StyledTag>
    );
}

export default BulletList;
