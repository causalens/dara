import { type CSSProperties, useState } from 'react';

import styled from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

import { BackendErrors } from './backend-errors';

const DevToolsContentWrapper = styled.div`
    display: flex;
    flex: 1;
    flex-direction: column;

    width: 100%;

    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.blue1};
    border-left: 1px solid ${(props) => props.theme.colors.grey5};
`;

const HeaderWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    margin: 0 auto;

    border-bottom: 1px solid;
    border-bottom-color: ${(props) => props.theme.colors.grey5};
`;

const DevtoolSelector = styled.div`
    display: flex;
    flex-shrink: 1;
    gap: 0.1rem;
    align-items: center;

    button {
        gap: 1rem;
        width: 125px;
    }
`;

const CloseButton = styled(Button)`
    color: ${(props) => props.theme.colors.grey4};
    background-color: inherit;
    transition: color 100ms ease 0s;

    :hover:not(:disabled) {
        color: ${(props) => props.theme.colors.grey5};
        background-color: inherit;
    }
`;

const SelectionButton = styled(Button)<{
    $selected: boolean;
}>`
    color: ${(props) => props.theme.colors.text};
    border-bottom: 2px solid ${(props) => props.theme.colors.primary};
    border-radius: 0;

    :hover:not(:disabled) {
        color: ${(props) => props.theme.colors.text};
        background-color: ${(props) => props.theme.colors.blue2};
    }
`;

interface DevToolsContentProps {
    onCloseDevtools: () => void;
    style?: CSSProperties;
}

enum DevTools {
    ERRORS = 'errors',
}

/**
 * Displays devtools content.
 * Displays a selected devtool based on the selected devtool in the top selection header.
 */
function DevToolsContent(props: DevToolsContentProps): JSX.Element {
    const [selectedTool, setSelectedTool] = useState(DevTools.ERRORS);

    return (
        <DevToolsContentWrapper style={props.style}>
            <HeaderWrapper>
                <DevtoolSelector>
                    <SelectionButton
                        $selected={selectedTool === DevTools.ERRORS}
                        onClick={() => setSelectedTool(DevTools.ERRORS)}
                        styling="ghost"
                    >
                        Errors
                    </SelectionButton>
                </DevtoolSelector>
                <CloseButton onClick={props.onCloseDevtools}>
                    <i className="fa-solid fa-x" />
                </CloseButton>
            </HeaderWrapper>
            {selectedTool === DevTools.ERRORS && <BackendErrors />}
        </DevToolsContentWrapper>
    );
}

export default DevToolsContent;
