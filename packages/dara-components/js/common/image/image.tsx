import { type StyledComponentProps, injectCss, prependBaseUrl, useComponentStyles } from '@darajs/core';
import styled from '@darajs/styled-components';

interface ImageProps extends StyledComponentProps {
    /**
     * Src URL
     */
    src?: string;
}

const ImageComponent = styled.div<StyledComponentProps>`
    display: flex;
`;

const StyledImg = injectCss(ImageComponent);

/**
 * A component for displaying images files.
 *
 * @param {ImageProps} props - the component props
 */
function Image(props: ImageProps): JSX.Element {
    const [style, css] = useComponentStyles(props);

    const source = prependBaseUrl(props.src);

    return (
        <StyledImg $rawCss={css} style={style}>
            <img alt={`Could not load ${source}`} loading="lazy" src={source} />
        </StyledImg>
    );
}

export default Image;
