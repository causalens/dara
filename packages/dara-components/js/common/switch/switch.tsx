import { type Variable, injectCss, useAction, useComponentStyles, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';
import { Switch as UISwitch } from '@darajs/ui-components';

import { useFormContext } from '../context';
import { type FormComponentProps } from '../types';

const _SwitchDiv = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    margin: 0.5rem 0;
`;
const SwitchDiv = injectCss(_SwitchDiv);

interface SwitchProps extends FormComponentProps {
    /** Switch position - interactive */
    // eslint-disable-next-line react/no-unused-prop-types
    value?: Variable<boolean>;
}
/**
 * A component for rendering a switch. Takes an optional label that will be rendered to its left.
 *
 * @param props - the component props
 */
function Switch(props: SwitchProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue());
    const onChangeAction = useAction(props.onchange);

    function onChange(enabled: boolean): void {
        setValue(enabled);
        onChangeAction(enabled);
        formCtx.updateForm(enabled);
    }

    return (
        <SwitchDiv $rawCss={css} style={style}>
            <UISwitch onChange={onChange} value={value} id={props.id_} />
        </SwitchDiv>
    );
}

export default Switch;
