import { GetPropsCommonOptions, UseSelectGetToggleButtonPropsOptions } from 'downshift';
import React from 'react';

import styled from '@darajs/styled-components';

import Button from '../button/button';
import { Chevron } from '../utils';

const StyledChevronButton = styled(Button).attrs((attrs) => ({ ...attrs, styling: 'ghost' }))`
    min-width: 0;
    height: auto;
    margin: 0;
    padding: 0 0.25rem;

    background-color: transparent !important;
`;

type Props = {
    /** Function to get props for the toggle button */
    getToggleButtonProps: (
        options?: UseSelectGetToggleButtonPropsOptions,
        otherOptions?: GetPropsCommonOptions
    ) => Record<string, unknown>;
    /** Boolean to indicate if the button is disabled */
    disabled: boolean;
    /** Boolean to indicate if the dropdown is open */
    isOpen: boolean;
};

/**
 * ChevronButton component for rendering a button with a chevron icon.
 *
 * @param {Props} props - The props for the component
 */
const ChevronButton = ({ getToggleButtonProps, disabled, isOpen, ...props }: Props): JSX.Element => (
    <StyledChevronButton {...getToggleButtonProps()} {...props}>
        <Chevron disabled={disabled} isOpen={isOpen} />
    </StyledChevronButton>
);

export default React.memo(ChevronButton);
