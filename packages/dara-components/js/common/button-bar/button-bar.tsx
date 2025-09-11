/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback } from 'react';

import { type Variable, injectCss, useAction, useComponentStyles, useVariable } from '@darajs/core';
import { type Item, ButtonBar as UiButtonBar } from '@darajs/ui-components';

import { useFormContext } from '../context';
import { type FormComponentProps } from '../types';

interface ButtonBarProps extends FormComponentProps {
    /** Passthrough the className property */
    className: string;
    /** The list of items to choose from */
    items: Array<Item>;
    /** The style of the button, accepts: primary, secondary. Defaults to primary */
    styling?: 'primary' | 'secondary';
    /** The selectedItem variable to read and update */
    // eslint-disable-next-line react/no-unused-prop-types
    value?: Variable<string>;
}

const StyledButtonBar = injectCss(UiButtonBar);

/**
 * The ButtonBar component accepts a list of items and a value. It's design to let you quickly choose from a short list
 * of items with a single click.
 *
 * @param props the component props
 */
function ButtonBar(props: ButtonBarProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue(props.items[0]!.value));
    const onChangeAction = useAction(props.onchange);

    const onSelect = useCallback(
        (item: Item) => {
            setValue(item.value);
            onChangeAction(item.value);
            formCtx.updateForm(item.value);
        },
        [setValue, onChangeAction]
    );

    return (
        <StyledButtonBar
            id={props.id_}
            $rawCss={css}
            className={props.className}
            items={props.items}
            onSelect={onSelect}
            style={style}
            styling={props.styling}
            value={props.items.find((item) => item.value === value)}
        />
    );
}

export default ButtonBar;
