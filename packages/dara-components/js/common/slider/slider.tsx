import _debounce from 'lodash/debounce';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { type Variable, injectCss, useAction, useComponentStyles, useVariable } from '@darajs/core';
import { Slider as UISlider } from '@darajs/ui-components';
import { useLatestRef } from '@darajs/ui-utils';

import { useFormContext } from '../context';
import { type FormComponentProps } from '../types';

interface SliderProps extends FormComponentProps {
    /** An optional flag to disable the input alternative switch render, its false by default */
    disable_input_alternative?: boolean;
    /** The range of the slider */
    domain: [number, number];
    /** Draw track from leftmost handle to start */
    rail_from_start?: boolean;
    /** Track labels */
    rail_labels?: Array<string>;
    /** Draw track from rightmost handle to end */
    rail_to_end: boolean;
    /** Slider thumb labels */
    thumb_labels?: Array<string>;
    /** Slider step size */
    step?: number;
    /** Slider tick positions */
    ticks?: Array<number>;
    /** Slider handle values - interactive */
    // eslint-disable-next-line react/no-unused-prop-types
    value?: Variable<Array<number> | number>;
}

const StyledSlider = injectCss(UISlider);

/**
 * A component for rendering a slider bar with handles. This component is interactive, so the value of each handle
 * is updated when they are moved.
 *
 * @param props - the component props
 */
function Slider(props: SliderProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [style, css] = useComponentStyles(props);

    const [value, setValue] = useVariable(formCtx.resolveInitialValue(props.domain[0]));
    // store separate internal value for instant updates, actual variable is updated via debounce
    const [internalValue, setInternalValue] = useState(value);

    const onTrack = useAction(props.onchange);

    const debouncedSetValue = useMemo(() => _debounce(setValue, 300), [setValue]);
    const debouncedOnTrack = useMemo(() => _debounce(onTrack, 300), [onTrack]);
    const debouncedUpdateForm = useMemo(() => _debounce(formCtx.updateForm, 300), [formCtx.updateForm]);

    const isOutputNumber = typeof internalValue === 'number';

    const onChange = useCallback(
        (values: number[]) => {
            let serialisedValues: number[] | number = values;

            // if we're supposed to output a number, unwrap the array
            if (isOutputNumber) {
                serialisedValues = values[0]!;
            }

            // immediately update internal state
            setInternalValue(serialisedValues);

            debouncedSetValue(serialisedValues);
            debouncedUpdateForm(serialisedValues);
            debouncedOnTrack?.(serialisedValues);
        },
        [isOutputNumber, debouncedSetValue, debouncedUpdateForm, debouncedOnTrack]
    );

    const debouncedUpdateFormRef = useLatestRef(debouncedUpdateForm);
    const debouncedSetValueRef = useLatestRef(debouncedSetValue);
    const domainRef = useLatestRef(props.domain);

    useEffect(() => {
        // cancel in-progress debounced updates to make sure the variable value takes precedence
        debouncedSetValueRef.current.cancel();
        debouncedUpdateFormRef.current.cancel();

        // handle string values
        let newValue = value;
        if (typeof value === 'string') {
            newValue = parseFloat(value);
        }

        if (Number.isNaN(newValue)) {
            [newValue] = domainRef.current;
        }

        // Sync the internal value with the variable value when the variable value changes
        setInternalValue(newValue);
    }, [value, domainRef, debouncedSetValueRef, debouncedUpdateFormRef]);

    // Values passed to the UI component must always be an array
    const parsedValues = isOutputNumber ? [internalValue] : internalValue;

    return (
        <StyledSlider
            $rawCss={css}
            disableInputAlternative={props.disable_input_alternative}
            domain={props.domain}
            onChange={onChange}
            step={props.step}
            style={style}
            ticks={props.ticks}
            trackLabels={props.rail_labels}
            trackToEnd={props.rail_to_end}
            trackToStart={props.rail_from_start}
            thumbLabels={props.thumb_labels}
            values={parsedValues}
        />
    );
}

export default Slider;
