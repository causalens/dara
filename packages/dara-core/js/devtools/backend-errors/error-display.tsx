import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Collapse } from 'react-collapse';

import styled from '@darajs/styled-components';

import { ServerErrorMessage } from '@/api/websocket';

const ErrorWrapper = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;

    /* stylelint-disable selector-class-pattern */
    .ReactCollapse--collapse {
        transition: height 0.35s ease;
    }
    /* stylelint-enable selector-class-pattern */
`;

const ErrorHeader = styled.div`
    cursor: pointer;
    display: flex;
    flex-direction: column;
    background-color: ${(props) => props.theme.colors.background};
`;

const CollapseContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    width: 100%;
    margin: 0;
    padding-top: 0.5rem;

    background-color: ${(props) => props.theme.colors.background};
`;

const ErrorSign = styled.i`
    color: ${(props) => props.theme.colors.error};
`;

const ErrorDescription = styled.div`
    width: 100%;
    padding: 1rem;

    font-family: monospace;
    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.grey2};
`;

const ErrorTitleRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
`;

const ErrorTitle = styled.span`
    display: flex;
    gap: 0.5rem;
    align-items: center;
    color: ${(props) => props.theme.colors.text};
`;

const ErrorTraceback = styled.pre`
    overflow-y: auto;
    padding: 0.5rem;
    color: ${(props) => props.theme.colors.text};
`;

const Chevron = styled.i<{
    $isOpen: boolean;
}>`
    cursor: pointer;
    transform: ${(props) => (props.$isOpen ? `rotate(180deg)` : `rotate(0deg)`)};
    color: ${(props) => props.theme.colors.grey5};
    transition: transform 0.1s linear;
`;

interface ParsedBackendError {
    description: string;
    time: Date;
    traceback: string;
    tracebackTitle: string;
}

/**
 * Parse server error messages for display
 *
 * @param errors error messages to parse
 */
export function parseErrorsForDisplay(errors: ServerErrorMessage['message'][]): ParsedBackendError[] {
    return errors.map((e) => {
        const errorContent = e.error.split('\n').filter((l) => l !== '');

        const time = parseISO(e.time);
        const [description] = errorContent.slice(-1);
        const tracebackTitle = errorContent[0];
        const traceback = errorContent.slice(1, -1).join('\n');

        return {
            description,
            time,
            traceback,
            tracebackTitle,
        };
    });
}

interface ErrorDisplayProps {
    errorMessage: ParsedBackendError;
}

/**
 * Display a single backend error in an expandable box
 */
function ErrorDisplay(props: ErrorDisplayProps): JSX.Element {
    const [isExpanded, setIsExpanded] = useState(false);

    const time = format(props.errorMessage.time, 'HH:mm:ss.SS');

    const onClick = (): void => {
        setIsExpanded((b) => !b);
    };

    return (
        <ErrorWrapper>
            <ErrorHeader onClick={onClick}>
                <ErrorTitleRow>
                    <ErrorTitle>
                        <ErrorSign className="fa-solid fa-triangle-exclamation fa-lg" />
                        {time}
                    </ErrorTitle>
                    <Chevron $isOpen={isExpanded} className="fa-solid fa-chevron-down" />
                </ErrorTitleRow>
                <ErrorDescription>{props.errorMessage.description}</ErrorDescription>
            </ErrorHeader>
            <Collapse isOpened={isExpanded}>
                <CollapseContent>
                    <ErrorDescription>{props.errorMessage.tracebackTitle}</ErrorDescription>
                    <ErrorTraceback>{props.errorMessage.traceback}</ErrorTraceback>
                </CollapseContent>
            </Collapse>
        </ErrorWrapper>
    );
}

export default ErrorDisplay;
