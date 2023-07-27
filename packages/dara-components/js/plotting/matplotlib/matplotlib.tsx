import { StyledComponentProps, injectCss, useComponentStyles } from '@darajs/core';

interface MatplotlibProps extends StyledComponentProps {
    figure: string;
}

const StyledImg = injectCss('img');

/**
 * A component for displaying an image of Matplotlib or Seaborn plot.
 *
 * @param {MatplotlibProps} props - the component props
 */
function Matplotlib(props: MatplotlibProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    return (
        <StyledImg
            $rawCss={css}
            alt="Matplotlib graph"
            src={`data:image/svg+xml;base64,${props.figure}`}
            style={style}
        />
    );
}

export default Matplotlib;
