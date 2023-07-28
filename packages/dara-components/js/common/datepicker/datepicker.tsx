import { formatISO, parseISO } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';

import { Variable, injectCss, useAction, useComponentStyles, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';
import { DatePicker as UIDatePicker } from '@darajs/ui-components';

import { useFormContext } from '../context';
import { FormComponentProps } from '../types';

const DatepickerDiv = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
`;
const StyledDatepickerDiv = injectCss(DatepickerDiv);

/**
 * Parse a server datetime string to a Date object
 */
export function parseDateString(date: string | Date): Date {
    if (!date) {
        return;
    }
    if (date instanceof Date) {
        return date;
    }
    const parsed = parseISO(date);

    if (Number.isNaN(parsed.getTime())) {
        return;
    }

    return parsed;
}

interface DatepickerProps extends FormComponentProps {
    /** Date format displayed - default: dd/MM/yyyy */
    date_format?: string;
    /** If the time is selectable - default: off */
    enable_time: boolean;
    /** Maximum date available - default: no max */
    max_date?: string;
    /** Minimum date available - default: no min */
    min_date?: string;
    /** If range is true, create two datepickers side by side */
    range: boolean;
    /** Whether datepicker closes when a date is selected - default: closes */
    select_close: boolean;
    /** Date variable to read and update */
    // eslint-disable-next-line react/no-unused-prop-types
    value?: Variable<string | [string, string]>;
}
/**
 * A component for rendering a calendar from which a date is selectable. If range is true, creates two datepickers
 * that allow a date range to be specified. The date variable that will be updated when selecting a date.
 *
 * @param props - the component props
 */
function Datepicker(props: DatepickerProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue());
    const [onChangeAction] = useAction(props.onchange);
    const isFirstRender = useRef(true);

    const onChange = (date: Date | [Date, Date]): void => {
        if (!isFirstRender.current && ((!Array.isArray(date) && date) || (Array.isArray(date) && date[0] && date[1]))) {
            let newDate: string | [string, string];
            if (Array.isArray(date)) {
                newDate = [formatISO(date[0]), formatISO(date[1])];
            } else {
                newDate = formatISO(date);
            }

            setValue(newDate);
            onChangeAction(newDate);
            formCtx.updateForm(newDate);
        }
    };

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
        }
    }, []);

    const formattedValue: Date | [Date, Date] = useMemo(() => {
        if (props.range && value) {
            return [parseDateString(value?.[0]), parseDateString(value?.[1])];
        }
        return parseDateString(value);
    }, [value, props.range]);

    return (
        <StyledDatepickerDiv $rawCss={css} style={style}>
            <UIDatePicker
                dateFormat={props.date_format}
                maxDate={parseDateString(props.max_date)}
                minDate={parseDateString(props.min_date)}
                onChange={onChange}
                popperStrategy="fixed"
                selectsRange={props.range}
                shouldCloseOnSelect={props.select_close}
                showTimeInput={props.enable_time}
                value={formattedValue as any}
            />
        </StyledDatepickerDiv>
    );
}

export default Datepicker;
