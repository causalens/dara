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

interface ServerMenuItem {
    label: string | ComponentInstance;
    icon?: string;
    style?: React.CSSProperties;
    preventClose?: boolean;
    before?: ComponentInstance;
    after?: ComponentInstance;
}

interface DropdownMenuProps extends StyledComponentProps {
    button: ComponentInstance;
    menu_items: MenuItem[][] | Variable<MenuItem[][]>;
    onclick: Action;
}

function DropdownMenu(props: DropdownMenuProps): JSX.Element {
    const [serverMenuItems] = useVariable(props.menu_items);
    const onClick = useAction(props.onclick);

    const menuItems = React.useMemo<MenuItem[][]>(() => {
        return serverMenuItems.map((section: ServerMenuItem[]) => {
            return section.map((item: ServerMenuItem) => {
                return {
                    label: typeof item.label === 'string' ? item.label : <DynamicComponent component={item.label} />,
                    icon: getIcon(item.icon),
                    style: item.style,
                    preventClose: item.preventClose,
                    before: item.before ? <DynamicComponent component={item.before} /> : undefined,
                    after: item.after ? <DynamicComponent component={item.after} /> : undefined,
                } satisfies MenuItem;
            });
        });
    }, [serverMenuItems]);

    return (
        <UIDropdownMenu
            onClick={onClick}
            menuItems={menuItems}
            button={<DynamicComponent component={props.button} />}
        />
    );
}

export default DropdownMenu;
