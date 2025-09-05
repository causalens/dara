import { Float } from '@headlessui-float/react';
import { Menu } from '@headlessui/react';
import * as React from 'react';

import styled from '@darajs/styled-components';

export const StyledDropdown = styled.div`
    overflow: hidden;
    display: flex;
    flex-direction: column;

    background-color: ${(props) => props.theme.colors.blue1};
    border-radius: 4px;
    outline: none;
    box-shadow: rgb(0 0 0 / 10%) 0 2px 5px;

    & > button:first-child {
        border-radius: 4px;
    }

    &.enter {
        transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
        transition-duration: 100ms;
        transition-property: opacity, transform;
    }

    &.enter-from {
        transform: scale(0.95);
        opacity: 0;
    }

    &.enter-to {
        transform: scale(1);
        opacity: 1;
    }

    &.leave {
        transition-timing-function: cubic-bezier(0.4, 0, 1, 1);
        transition-duration: 75ms;
        transition-property: opacity, transform;
    }

    &.leave-from {
        transform: scale(1);
        opacity: 1;
    }

    &.leave-to {
        transform: scale(0.95);
        opacity: 0;
    }
`;

export const StyledDropdownMenuItem = styled.button`
    cursor: pointer;

    display: flex;
    gap: 0.25rem;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    min-width: 160px;
    height: fit-content;
    padding: 5px 8px;

    font-size: 0.9rem;
    color: ${(props) => props.theme.colors.text};
    white-space: nowrap;

    background-color: ${(props) => props.theme.colors.blue1};
    border: none;
    border-radius: 4px;
    box-shadow: none;

    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 150ms;
    transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;

    &:hover {
        background-color: ${(props) => props.theme.colors.grey1};
    }

    &:active {
        background-color: ${(props) => props.theme.colors.grey2};
    }

    &:disabled {
        cursor: not-allowed;
        color: ${(props) => props.theme.colors.grey3};

        svg {
            color: ${(props) => props.theme.colors.grey3};
        }
    }
`;

const DropdownMenu = styled.div`
    padding: 4px;
`;

export const HorizontalDivider = styled.hr`
    width: 100%;
    margin: 0.25rem 0;
    border: none;
    border-top: 1px solid ${(props) => props.theme.colors.grey2};
`;

const ItemLabel = styled.div`
    display: flex;
    gap: 0.5rem;
    width: 100%;
`;

export const Hotkey = styled.div`
    color: ${(props) => props.theme.colors.grey3};
`;

/**
 * Item displayed in the dropdown
 */
export type MenuItem = {
    label: string | React.ReactNode;
    disabled?: boolean;
    icon?: React.ReactNode;
    style?: React.CSSProperties;
    preventClose?: boolean;
    before?: React.ReactNode;
    after?: React.ReactNode;
};

export type DropdownMenuProps = {
    /** Menu items to display in the menu. */
    menuItems: MenuItem[][];
    /**
     * The function to call when the dropdown menu option is picked
     */
    onClick?: (item: MenuItem, index: [number, number]) => void;
    /**
     * The button to display for opening the dropdown menu
     */
    button: React.ReactNode;
    /**
     * Any footer content to display in the dropdown.
     * This is useful for displaying additional information in the dropdown.
     */
    footer?: React.ReactNode;
    /** Optional id property */
    id?: string;
};

interface DropdownProps {
    /**
     * Menu items to display in the menu.
     */
    menuItems: MenuItem[][];
    /**
     * The callback to call when the dropdown menu option is picked
     */
    onClick?: (menuItem: MenuItem, index: [number, number]) => void;
    /**
     * Any footer content to display in the dropdown.
     * This is useful for displaying additional information in the dropdown.
     */
    footer?: React.ReactNode;
    /** Optional id property */
    id?: string;
}

export const Dropdown = (props: DropdownProps): JSX.Element => {
    const { menuItems, onClick } = props;

    return (
        <DropdownMenu id={props.id}>
            {menuItems.map((section: MenuItem[], index) => (
                <React.Fragment key={`dropdown-section-${index}`}>
                    {section.map((item: MenuItem, itemIndex) => (
                        <Menu.Item key={typeof item.label === 'string' ? item.label : (item.label as any).key}>
                            {({ close: headlessClose }) => (
                                <StyledDropdownMenuItem
                                    disabled={item.disabled}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onClick?.(item, [index, itemIndex]);
                                        if (!item.preventClose) {
                                            headlessClose();
                                        }
                                    }}
                                    role="menuitem"
                                    style={item.style}
                                >
                                    {item.before}
                                    <ItemLabel>
                                        {item.icon}
                                        {item.label}
                                    </ItemLabel>
                                    {item.after}
                                </StyledDropdownMenuItem>
                            )}
                        </Menu.Item>
                    ))}
                    {index < menuItems.length - 1 && <HorizontalDivider />}
                </React.Fragment>
            ))}
            {props.footer}
        </DropdownMenu>
    );
};

function MenuDropdown(props: DropdownMenuProps): JSX.Element {
    return (
        <Menu>
            {() => (
                <Float
                    enter="enter"
                    enterFrom="enter-from"
                    enterTo="enter-to"
                    flip
                    leave="leave"
                    leaveFrom="leave-from"
                    leaveTo="leave-to"
                    offset={4}
                    placement="bottom-end"
                    portal
                    zIndex={9997}
                >
                    <Menu.Button as={React.Fragment}>{props.button}</Menu.Button>
                    <Menu.Items as={StyledDropdown}>
                        <Dropdown {...props} />
                    </Menu.Items>
                </Float>
            )}
        </Menu>
    );
}

export default MenuDropdown;
