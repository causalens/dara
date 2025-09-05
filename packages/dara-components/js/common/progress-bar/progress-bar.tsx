import { type StyledComponentProps, type Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';
import { ProgressBar as UiProgressBar } from '@darajs/ui-components';

const ProgressBarWrapper = styled.div`
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
`;
const StyledProgressBar = injectCss(ProgressBarWrapper);

interface ProgressBarProps extends StyledComponentProps {
    /** Optional color prop for the progress bar, should be a hex code */
    color?: string;
    /** The current progress as a percentage */
    progress: number | Variable<number>;
    /** Set the progress bar to view as a smaller strip with no label */
    small?: boolean;
}

/**
 * A simple progress bar component, that displays the current progress to 100% as a bar with a small label
 *
 * @param props the component props
 */
function ProgressBar(props: ProgressBarProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [progress] = useVariable(props.progress);
    return (
        <StyledProgressBar $rawCss={css} style={style} id={props.id_}>
            <UiProgressBar color={props.color} progress={progress} small={props.small} />
        </StyledProgressBar>
    );
}

export default ProgressBar;
