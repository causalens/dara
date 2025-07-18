import * as React from 'react';

import {
    type Action,
    type ComponentInstance,
    DynamicComponent,
    type StyledComponentProps,
    type Variable,
    getIcon,
    useAction,
    useVariable,
} from '@darajs/core';
import { type MenuItem, DropdownMenu as UIDropdownMenu } from '@darajs/ui-components';

import Button from '../button/button';

/** Server-side menu item definition, including ComponentInstances */
interface ServerMenuItem {
    label: string | ComponentInstance;
    icon?: string;
    style?: React.CSSProperties;
    prevent_close?: boolean;
    before?: ComponentInstance;
    after?: ComponentInstance;
}

interface DropdownMenuProps extends StyledComponentProps {
    button: ComponentInstance;
    menu_items: ServerMenuItem[][] | Variable<ServerMenuItem[][]>;
    onclick: Action;
    footer?: ComponentInstance;
}

function DropdownMenu(props: DropdownMenuProps): JSX.Element {
    const [serverMenuItems] = useVariable(props.menu_items);
    const onClickAction = useAction(props.onclick);

    // translate server-side ComponentInstances and string icons into client-side React components
    const menuItems = React.useMemo<MenuItem[][]>(() => {
        return serverMenuItems.map((section) => {
            return section.map((item) => {
                const Icon = item.icon ? getIcon(item.icon) : null;
                return {
                    label: typeof item.label === 'string' ? item.label : <DynamicComponent component={item.label} />,
                    icon: Icon ? <Icon /> : undefined,
                    style: item.style,
                    preventClose: item.prevent_close,
                    before: item.before ? <DynamicComponent component={item.before} /> : undefined,
                    after: item.after ? <DynamicComponent component={item.after} /> : undefined,
                } satisfies MenuItem;
            });
        });
    }, [serverMenuItems]);

    const onClick = React.useCallback(
        (_item: MenuItem, index: [number, number]) => {
            // look up the server-side item and call the action, we don't want to send the react components
            const serverItem = serverMenuItems[index[0]][index[1]];
            onClickAction(serverItem);
        },
        [onClickAction, serverMenuItems]
    );

    return (
        <UIDropdownMenu
            onClick={onClick}
            menuItems={menuItems}
            button={<Button {...props.button.props} />}
            footer={props.footer ? <DynamicComponent component={props.footer} /> : undefined}
        />
    );
}

export default DropdownMenu;
