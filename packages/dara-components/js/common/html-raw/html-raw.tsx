import { type StyledComponentProps, injectCss, useComponentStyles } from '@darajs/core';
import styled from '@darajs/styled-components';

const _Wrapper = styled.div`
    display: flex;
    width: 100%;
    height: 100%;
`;
const Wrapper = injectCss(_Wrapper);

interface HtmlRawProps extends StyledComponentProps {
    /** Pass through the className property */
    className: string;
    /** The raw html to display, should be string */
    html: string;
}

/**
 * A component to display a raw HTML. It stretches to fit the container.
 *
 * @param props - the component props
 */
function HtmlRaw(props: HtmlRawProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    return (
        <Wrapper
            id={props.id_}
            $rawCss={css}
            className={props.className}
            // bearer:disable javascript_react_dangerously_set_inner_html
            dangerouslySetInnerHTML={{ __html: props.html }}
            style={style}
        />
    );
}

export default HtmlRaw;
