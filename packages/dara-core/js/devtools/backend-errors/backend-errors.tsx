import { isAfter } from 'date-fns';
import { useState } from 'react';

import styled from '@darajs/styled-components';
import { Button, Input as UIInput } from '@darajs/ui-components';

import { useBackendErrors } from './backend-errors-ctx';
import ErrorDisplay, { parseErrorsForDisplay } from './error-display';

const ErrorsContainer = styled.div`
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: 100%;
`;

const ErrorList = styled.div`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    height: 100%;
`;

const ClearButton = styled(Button)`
    padding: 0 0.5rem;
    color: ${(props) => props.theme.colors.grey4};
    background-color: inherit;
    transition: color 100ms ease 0s;

    :hover:not(:disabled) {
        color: ${(props) => props.theme.colors.grey5};
        background-color: inherit;
    }
`;

const Toolbar = styled.div`
    display: flex;
    gap: 0.5rem;
    align-items: center;

    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
    padding-left: 0.5rem;

    border-bottom: 1px solid;
    border-bottom-color: ${(props) => props.theme.colors.grey5};
`;

/**
 * Displays backend errors as an accordion list with a filter bar at the top
 */
function BackendErrors(): JSX.Element {
    const [searchQuery, setSearchQuery] = useState('');
    const { errors, clearErrors } = useBackendErrors();

    const parsedErrors = parseErrorsForDisplay(errors)
        .filter((e) => e.description.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => (isAfter(b.time, a.time) ? 1 : -1));

    return (
        <ErrorsContainer>
            <Toolbar>
                <ClearButton onClick={clearErrors}>
                    <i className="fa-solid fa-ban fa-lg" />
                </ClearButton>
                <UIInput onChange={(e) => setSearchQuery(e)} placeholder="Filter" value={searchQuery} />
            </Toolbar>
            <ErrorList>
                {parsedErrors.map((e) => (
                    <ErrorDisplay errorMessage={e} key={e.time.getTime()} />
                ))}
            </ErrorList>
        </ErrorsContainer>
    );
}

export default BackendErrors;
