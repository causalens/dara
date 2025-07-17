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
 * The ContextMenu is a higher order component that wraps another react component and overrides its context menu to be a
 * custom list of actions, defined by the actions prop.
 *
 * @param Component the component to wrap and draw as the root
 */
function ContextMenu<T>(Component: React.ComponentType<T> | string): (props: ContextMenuProps<T>) => JSX.Element {
    function WrappedContextMenu(props: ContextMenuProps<T>): JSX.Element {
        const items = React.useMemo<MenuItem[][]>(() => {
            return [
                props.actions.map(
                    (act) =>
                        ({
                            label: act.label,
                        }) satisfies MenuItem
                ),
            ];
        }, [props.actions]);

        const uid = React.useId();

        const menuRefs = React.useRef<ExtendedRefs<HTMLElement> | null>(null);
        const setShowRef = React.useRef<(show: boolean) => void>();

        /**
         * Remember which actions are currently showing in the context menu.
         * These should be set once context menu is being opened.
         * This is to prevent actions from changing while the menu is being closed and transitioning out.
         */
        const [itemsShowing, setItemsShowing] = React.useState<MenuItem[][]>([]);

        const show = React.useCallback(() => {
            setItemsShowing(items);
            setShowRef.current?.(true);
        }, [items]);

        const hide = React.useCallback(() => {
            setShowRef.current?.(false);
        }, []);

        React.useEffect(() => {
            const unsub = Sync$.subscribe((msg) => {
                if (msg !== uid) {
                    hide();
                }
            });

            return () => {
                unsub();
            };
        }, [hide, uid]);

        // close the context menu when clicking outside of it
        useOutsideClick(
            () => menuRefs.current?.floating ?? document.body,
            () => {
                hide();
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
            const actionIndex = index[1];
            props.actions[actionIndex].action();
            hide();
        }

        return (
            <>
                <Component
                    {...props.elementProps}
                    className={props.className}
                    onContextMenu={(e: React.MouseEvent) => {
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
                            show();
                        }

                        // prevent bubbling (otherwise nested context menu components would fire all parent context menus)
                        e.stopPropagation();
                        // prevent browser context menu
                        e.preventDefault();
                    }}
                >
                    {props.children}
                </Component>
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
                >
                    <Menu>
                        <Menu.Items as={StyledDropdown} static>
                            <Dropdown menuItems={itemsShowing} onClick={onClick} />
                        </Menu.Items>
                    </Menu>
                </Float.Virtual>
            </>
        );
    }

    return WrappedContextMenu;
}

export default ContextMenu;
