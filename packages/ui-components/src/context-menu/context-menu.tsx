/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { type ExtendedRefs } from '@floating-ui/react';
import { Float, type FloatVirtualInitialProps, useOutsideClick } from '@headlessui-float/react';
import { Menu } from '@headlessui/react';
import React from 'react';

import { Dropdown, type MenuItem, StyledDropdown } from '../dropdown-menu/dropdown-menu';

export interface MenuAction {
    action: () => void;
    label: string;
}

export interface ContextMenuProps<T> {
    /** An array of actions to show in the context menu */
    actions: Array<MenuAction>;
    /** Pass through children onto the root element */
    children?: React.ReactNode;
    /** Pass through className onto the root element */
    className?: string;
    /** Any element props for the root element */
    elementProps?: T;
}

export interface UseContextMenuProps {
    /** Menu items to display in the context menu */
    menuItems: MenuItem[][];
    /** Optional click handler for menu items */
    onClick: (item: MenuItem, index: [number, number]) => void;
}

export interface UseContextMenuReturn {
    /** The onContextMenu handler to pass to your component */
    onContextMenu: (e: React.MouseEvent) => void;
    /** The context menu element to render */
    contextMenu: React.ReactNode;
}

/**
 * Simple synchronization mechanism to close all context menus when one is opened.
 * This is necessary as context menus capture the right click event which prevents us from using
 * simple 'click outside' event listeners for this purpose.
 */
type Callback = (uid: string) => void;
const subscribers: Callback[] = [];
const Sync$ = {
    subscribe: (cb: (uid: string) => void) => {
        subscribers.push(cb);

        return () => {
            subscribers.splice(subscribers.indexOf(cb), 1);
        };
    },
    next: (uid: string) => {
        subscribers.forEach((cb) => cb(uid));
    },
    unsubscribe: (cb: (uid: string) => void) => {
        subscribers.splice(subscribers.indexOf(cb), 1);
    },
};

/**
 * Hook-like component that provides context menu functionality via render prop pattern.
 * Returns an onContextMenu handler and the context menu element to render.
 */
export function useContextMenu(props: UseContextMenuProps): UseContextMenuReturn {
    const { menuItems, onClick: onItemClick } = props;

    const uid = React.useId();

    const menuRefs = React.useRef<ExtendedRefs<HTMLElement> | null>(null);
    const setShowRef = React.useRef<(show: boolean) => void>();

    const [isOpen, setIsOpen] = React.useState(false);

    const showMenu = React.useCallback(() => {
        setIsOpen(true);
        setShowRef.current?.(true);
    }, []);

    const hideMenu = React.useCallback(() => {
        setIsOpen(false);
        setShowRef.current?.(false);
    }, []);

    // close the context menu when clicking outside of it
    useOutsideClick(
        () => menuRefs.current?.floating ?? document.body,
        () => {
            hideMenu();
        }
    );

    /**
     * Runs on initial render of the context menu. This is used to store the refs and setShow function,
     * as exposed by the Float.Virtual component.
     */
    const onInitial = React.useCallback(({ refs, setShow }: FloatVirtualInitialProps) => {
        menuRefs.current = refs;
        setShowRef.current = setShow;
    }, []);

    function onClick(item: MenuItem, index: [number, number]): void {
        onItemClick(item, index);
        hideMenu();
    }

    const onContextMenu = React.useCallback((e: React.MouseEvent) => {
        if (menuRefs.current && setShowRef.current) {
            // dispatch event of a right click to close other context menu in the page
            document.dispatchEvent(new Event('contextmenu'));

            // close other context menus
            Sync$.next(uid);

            // set position of the menu to match cursor position
            menuRefs.current.setPositionReference({
                getBoundingClientRect: () => ({
                    width: 0,
                    height: 0,
                    x: e.clientX,
                    y: e.clientY,
                    top: e.clientY,
                    left: e.clientX,
                    right: e.clientX,
                    bottom: e.clientY,
                }),
            });
            showMenu();
        }

        // prevent bubbling (otherwise nested context menu components would fire all parent context menus)
        e.stopPropagation();
        // prevent browser context menu
        e.preventDefault();
    }, [showMenu, uid]);

    React.useEffect(() => {
        const unsub = Sync$.subscribe((msg) => {
            if (msg !== uid) {
                hideMenu();
            }
        });

        return () => {
            unsub();
        };
    }, [hideMenu, uid]);

    const contextMenu = (
        <Float.Virtual
            enter="enter"
            enterFrom="enter-from"
            enterTo="enter-to"
            flip
            leave="leave"
            leaveFrom="leave-from"
            onInitial={onInitial}
            leaveTo="leave-to"
            offset={4}
            placement="bottom-start"
            portal
            shift
            show={isOpen}
        >
            <Menu>
                <Menu.Items as={StyledDropdown} static>
                    <Dropdown menuItems={menuItems} onClick={onClick} />
                </Menu.Items>
            </Menu>
        </Float.Virtual>
    );

    return {
        onContextMenu,
        contextMenu,
    };
}

/**
 * The ContextMenu is a higher order component that wraps another react component and overrides its context menu to be a
 * custom list of actions, defined by the actions prop.
 *
 * @param Component the component to wrap and draw as the root
 */
function ContextMenu<T>(Component: React.ComponentType<T> | string): (props: ContextMenuProps<T>) => JSX.Element {
    function WrappedContextMenu(props: ContextMenuProps<T>): JSX.Element {
        const menuItems = React.useMemo<MenuItem[][]>(() => {
            return [
                props.actions.map(
                    (act) =>
                        ({
                            label: act.label,
                            title: act.label,
                        }) satisfies MenuItem
                ),
            ];
        }, [props.actions]);

        const handleClick = React.useCallback((_item: MenuItem, index: [number, number]) => {
            const [, itemIndex] = index;
            // Since we only have one section in the HOC case, use itemIndex to get the action
            const action = props.actions[itemIndex];
            if (action) {
                action.action();
            }
        }, [props.actions]);

        const { onContextMenu, contextMenu } = useContextMenu({
            menuItems,
            onClick: handleClick,
        });

        return (
            <>
                <Component {...props.elementProps} className={props.className} onContextMenu={onContextMenu}>
                    {props.children}
                </Component>
                {contextMenu}
            </>
        );
    }

    return WrappedContextMenu;
}

export default ContextMenu;
