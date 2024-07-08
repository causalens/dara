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
// eslint-disable-next-line import/no-duplicates
import { format, parse } from 'date-fns';
// eslint-disable-next-line import/no-duplicates
import enGB from 'date-fns/locale/en-GB';
import { range } from 'lodash';
import { transparentize } from 'polished';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactDatePicker, { ReactDatePickerProps } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

import styled from '@darajs/styled-components';
import { ChevronLeft, ChevronRight } from '@darajs/ui-icons';

import Button from '../button/button';
import Input from '../input/input';
import Tooltip from '../tooltip/tooltip';
import { InteractiveComponentProps, Item } from '../types';
import DatepickerSelect from './datepicker-select';

/**
 * Get all names of months as Items
 */
function getMonths(): Item[] {
    const months: Item[] = [];

    for (let i = 0; i < 12; i++) {
        months.push({ label: enGB.localize.month(i), value: i });
    }

    return months;
}

/**
 * Get a range of based on set min/max dates
 *
 * @param minDate minimum date
 * @param maxDate maximum date
 */
function getYears(minDate?: Date, maxDate?: Date): Item[] {
    const minYear = minDate?.getFullYear() ?? 1900;
    const maxYear = maxDate?.getFullYear() ?? 2100;

    return range(minYear, maxYear + 1, 1).map((val) => ({ label: val.toString(), value: val }));
}

/**
 * This is taken from react-datepicker codebase - putting it on an element will make clicking on it
 * NOT close the datepicker popper. We need it to make our custom Select work inside the datepicker.
 */
const IGNORE_CLASSNAME = 'react-datepicker-ignore-onclickoutside';

interface DatepickerWrapperProps {
    inline?: boolean;
    showsRange?: boolean;
    showsTime?: boolean;
}

const DatepickerWrapper = styled.div<DatepickerWrapperProps>`
    /* stylelint-disable selector-class-pattern */
    display: flex;
    flex-direction: ${(props) => (props.inline ? 'column' : 'row')};
    align-items: ${(props) => (props.inline ? 'baseline' : 'center')};

    width: 8.5rem;

    color: ${(props) => props.theme.colors.text};

    .react-datepicker-popper {
        z-index: 5;
        width: 16.45rem;
        height: 18.5rem;
    }

    .react-datepicker-wrapper {
        width: auto;
        margin-top: 1rem;
        margin-left: -8.5rem;

        ${(props) => {
            if (props.showsRange && props.showsTime) {
                return `margin-left: -19.045rem;
                margin-top: 3rem;`;
            }
            if (props.showsRange) {
                return `margin-left: -19.045rem;`;
            }
            if (props.showsTime) {
                return `margin-left: -14rem;`;
            }
        }}
    }

    .react-datepicker {
        width: 16.45rem;
        height: 18.5rem;

        font-family: Manrope, sans-serif;
        font-size: 0.75rem;

        background-color: ${(props) => props.theme.colors.grey1};
        border: 1px solid ${(props) => props.theme.colors.grey1};
        box-shadow: ${(props) => props.theme.shadow.light};

        svg {
            cursor: pointer;
        }

        .react-datepicker__triangle {
            visibility: hidden;
        }

        .react-datepicker__input-time-container {
            position: absolute;
            top: -51px;
            left: 150px;

            float: none;

            margin: 0;

            color: ${(props) => props.theme.colors.text};

            .react-datepicker-time__caption {
                display: none;
            }
        }

        .react-datepicker__month-container {
            .react-datepicker__header {
                margin-right: 3px;
                margin-left: 3px;
                padding: 1.25em 0.75em 0;

                color: ${(props) => props.theme.colors.text};

                background-color: ${(props) => props.theme.colors.grey1};
                border: none;

                .react-datepicker__day-names {
                    display: flex;
                    gap: 0.125rem;
                    justify-content: space-around;
                    margin-bottom: 0;

                    .react-datepicker__day-name {
                        width: 2rem;
                        height: 2rem;
                        margin: 0;

                        line-height: 2rem;
                        color: ${(props) => props.theme.colors.text};
                    }
                }
            }

            .react-datepicker__month {
                display: grid;
                gap: 0.125rem;

                /* Switch default margin to padding so it applies background color completely */
                margin: 0;
                padding: 0.125rem 0.75rem 0;

                color: ${(props) => props.theme.colors.text};

                background-color: ${(props) => props.theme.colors.grey1};

                .react-datepicker__week {
                    display: flex;
                    gap: 0.125rem;
                }

                .react-datepicker__day {
                    width: 2rem;
                    height: 2rem;
                    margin: 0;

                    line-height: 2rem;
                    color: ${(props) => props.theme.colors.text};

                    :hover {
                        background-color: ${(props) => props.theme.colors.grey2};
                    }

                    &.react-datepicker__day--outside-month {
                        color: ${(props) => props.theme.colors.grey4};
                    }

                    &.react-datepicker__day--selected {
                        color: ${(props) => props.theme.colors.blue1};
                        background-color: ${(props) => props.theme.colors.primary};

                        :hover {
                            background-color: ${(props) => props.theme.colors.primaryHover};
                        }
                    }

                    &.react-datepicker__day--keyboard-selected {
                        color: ${(props) => props.theme.colors.text};
                        background-color: ${(props) => transparentize(0.8, props.theme.colors.primary)};
                        border: 1px solid ${(props) => props.theme.colors.primary}

                        :hover {
                            background-color: ${(props) => transparentize(0.6, props.theme.colors.primary)};
                        }
                    }

                    &.react-datepicker__day--in-range {
                        color: ${(props) => props.theme.colors.blue1};
                        background-color: ${(props) => transparentize(0.2, props.theme.colors.primary)};
                    }

                    &.react-datepicker__day--in-selecting-range {
                        color: ${(props) => props.theme.colors.blue1};
                        background-color: ${(props) => props.theme.colors.primary};
                    }

                    &.react-datepicker__day--selecting-range-end {
                        font-weight: normal;
                        color: ${(props) => props.theme.colors.blue1};
                        background-color: ${(props) => props.theme.colors.primary};
                    }

                    &.react-datepicker__day--disabled {
                        color: ${(props) => props.theme.colors.grey3};

                        :hover {
                            background-color: ${(props) => props.theme.colors.grey1};
                        }
                    }
                }
            }
        }
    }
    /* stylelint-enable selector-class-pattern */
`;

const DatepickerInputs = styled.div`
    display: flex;
    gap: 0.5rem;
`;

const HeaderWrapper = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: 0.75rem;
`;

const MonthNavigation = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const DropdownsWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
`;

const MonthButton = styled(Button)`
    min-width: 0;
    height: 1.5rem;
    margin: 0;
    padding: 0.75rem 0.37rem;

    svg {
        width: 0.75rem;
        height: 0.75rem;
        color: ${(props) => props.theme.colors.grey5};
    }

    :hover:not(:disabled) {
        svg {
            color: ${(props) => props.theme.colors.text};
        }
    }
`;

const MonthSelect = styled(DatepickerSelect)`
    width: 6.25rem;
    margin-right: 0.55em;
    font-size: 0.875rem;
`;

const YearSelect = styled(DatepickerSelect)`
    width: 3.75rem;
    margin-right: 0.8em;
`;

const EndDateInputWrapper = styled.div`
    display: flex;
    gap: 0.5rem;
    align-items: center;
`;

interface DateTimeWrapperProps {
    isRange?: boolean;
}

const DateTimeWrapper = styled.div<DateTimeWrapperProps>`
    display: flex;
    flex-direction: ${(props) => (props.isRange ? 'column' : 'row')};
    gap: ${(props) => (props.isRange ? 'none' : '0.5rem')};
`;

interface DateInputProps {
    isTimeRange?: boolean;
}

const DateInput = styled.input<DateInputProps>`
    display: flex;
    align-items: center;

    width: 8.5rem;
    height: 2.5rem;
    padding: 0 1rem;

    font-size: 1rem;
    color: ${(props) => (props.disabled ? props.theme.colors.grey2 : props.theme.colors.text)};
    text-align: center;

    background-color: ${(props) => props.theme.colors.grey1};
    border: 1px solid ${(props) => props.theme.colors.grey1};
    border-radius: 0.25rem;
    border-radius: ${(props) => (props.isTimeRange ? '0.25rem 0.25rem 0rem 0rem' : '0.25rem')};
    outline: 0;

    :focus:not(:disabled) {
        border: 1px solid ${(props) => props.theme.colors.grey3};
    }

    :hover:not(:disabled) {
        background-color: ${(props) => props.theme.colors.grey2};
    }

    :disabled {
        cursor: not-allowed;
    }

    ::placeholder {
        font-style: italic;
    }

    ::-webkit-calendar-picker-indicator {
        display: none;
        background: none;
    }
`;

interface TimeInputProps {
    isRange?: boolean;
}

const TimeInput = styled(Input)<TimeInputProps>`
    width: ${(props) => (props.isRange ? '8.5rem' : '5rem')};

    input {
        position: relative;

        display: flex;
        justify-content: center;

        padding: 0.5rem;

        font-size: 1rem;
        color: ${(props) => props.theme.colors.text};
        text-align: center;

        border-radius: ${(props) => (props.isRange ? '0rem 0rem 0.25rem 0.25rem' : '0.25rem')};

        :focus:not(:disabled) {
            border: 1px solid ${(props) => props.theme.colors.grey3};
        }

        ::-webkit-calendar-picker-indicator {
            display: none;
            background: none;
        }

        ::after {
            content: '';

            position: absolute;
            top: 0;
            left: 1.2rem;

            display: block;

            width: 6rem;

            border-top: ${(props) => (props.isRange ? `1px solid ${props.theme.colors.grey2}` : 'none')};
        }
    }
`;

type DatepickerValue = Date | [Date, Date];
type TimeValue = string | [string, string];

/**
 * Change type of the value used based on `selectsRange` prop
 *
 * @prop selectsRange - whether the datepicker is in range select mode
 * @prop onChange - an optional onChange handler, will be called whenever the state of the datepicker changes
 * @prop value - the value of the datepicker puts it in controlled mode
 * @prop initialValue - the initial value of the datepicker
 */
type ConditionalProps =
    | {
          initialValue?: [Date, Date];
          onChange?: (date: [Date, Date], e?: React.SyntheticEvent<SVGSVGElement, Event>) => void | Promise<void>;
          selectsRange: true;
          value?: [Date, Date];
      }
    | {
          initialValue?: Date;
          onChange?: (date: Date, e?: React.SyntheticEvent<SVGSVGElement, Event>) => void | Promise<void>;
          selectsRange?: false;
          value?: Date;
      };

/**
 * Omitting props which are explicitly set in the conditional part of props.
 */
interface CommonDatePickerProps extends Omit<InteractiveComponentProps<DatepickerValue>, 'initialValue' | 'value'> {
    /** Dateformat string - how the dateformat will be shown - default dd/MM/yyyy */
    dateFormat?: string;
    /** Optional property to disable the date picker */
    disabled?: boolean;
    /** Whether to show the datepicker inline */
    inline?: boolean;
    /** Maximum date available - default is off */
    maxDate?: Date;
    /** Minimum date available - default is off */
    minDate?: Date;
    /** Controls popper positioning strategy */
    popperStrategy?: 'absolute' | 'fixed';
    /** Accepts ref to be passed to select dropdowns */
    portalsRef?: React.MutableRefObject<HTMLElement[]>;
    /** Optional classname to pass down to items of select components used in datepicker */
    selectItemClass?: string;
    /** Controls if the datepicker will be closed when a date is selected */
    shouldCloseOnSelect: boolean;
    /** Controls if the time input should be enabled - default is off */
    showTimeInput?: boolean;
}

export type DatePickerProps = CommonDatePickerProps & ConditionalProps;

/**
 * Custom DatePickerHeader component
 */
function DatePickerHeader({
    date,
    changeMonth,
    changeYear,
    decreaseMonth,
    increaseMonth,
    selectItemClass,
    portalsRef,
    minDate,
    maxDate,
}: Parameters<ReactDatePickerProps['renderCustomHeader']>[0] & {
    maxDate?: Date;
    minDate?: Date;
    portalsRef?: React.MutableRefObject<HTMLElement[]>;
    selectItemClass?: string;
}): JSX.Element {
    const months = useMemo(() => getMonths(), []);
    const years = useMemo(() => getYears(minDate, maxDate), [minDate, maxDate]);

    const selectedMonth = useMemo(() => {
        return { label: enGB.localize.month(date.getMonth()), value: date.getMonth() };
    }, [date]);
    const selectedYear = useMemo(() => ({ label: date.getFullYear().toString(), value: date.getFullYear() }), [date]);

    return (
        <HeaderWrapper>
            <DropdownsWrapper>
                <MonthSelect
                    displacement={-1.1}
                    dropdownRef={(element) => {
                        if (portalsRef) {
                            portalsRef.current[0] = element;
                        }
                    }}
                    itemClass={`${IGNORE_CLASSNAME} ${selectItemClass}`}
                    items={months}
                    onSelect={(item) => changeMonth(item.value)}
                    selectedItem={selectedMonth}
                    size={0.875}
                />
                <YearSelect
                    displacement={-7.8}
                    dropdownRef={(element) => {
                        if (portalsRef) {
                            portalsRef.current[1] = element;
                        }
                    }}
                    itemClass={`${IGNORE_CLASSNAME} ${selectItemClass}`}
                    items={years}
                    onSelect={(item) => changeYear(item.value)}
                    selectedItem={selectedYear}
                    size={0.875}
                />
                <MonthNavigation>
                    <MonthButton onClick={decreaseMonth} styling="ghost">
                        <ChevronLeft />
                    </MonthButton>
                    <MonthButton onClick={increaseMonth} styling="ghost">
                        <ChevronRight />
                    </MonthButton>
                </MonthNavigation>
            </DropdownsWrapper>
        </HeaderWrapper>
    );
}

/**
 * Turns time number given into a string that is two digits long
 *
 * @param time - the number of hours or minutes to format
 */
function getTimeFormatted(time: number): string {
    const timeString = String(time);
    if (timeString.length > 1) {
        return timeString;
    }
    return `0${timeString}`;
}

/**
 * Given an initial Date object gets the initial time set
 *
 * @param initialDate - a Date object
 * @param isRange - whether the datepicker is in range select mode
 *
 * @returns the time set
 */
function getInitialTime(initialDate: DatepickerValue, isRange: boolean): TimeValue {
    if (!initialDate) {
        if (isRange) {
            return ['00:00', '00:00'];
        }
        return '00:00';
    }

    if (Array.isArray(initialDate)) {
        return [
            `${getTimeFormatted(initialDate[0].getHours())}:${getTimeFormatted(initialDate[0].getMinutes())}`,
            `${getTimeFormatted(initialDate[1].getHours())}:${getTimeFormatted(initialDate[1].getMinutes())}`,
        ];
    }

    return `${getTimeFormatted(initialDate.getHours())}:${getTimeFormatted(initialDate.getMinutes())}`;
}

/**
 * Gets the initial date string
 *
 * @param initialDate - intial date values
 * @param formatToApply - the date format that the string should obey
 * @param isStart - for the case of range dates whether to get the first date or the second from the initialDate object
 */
function getInitialDate(initialDate: DatepickerValue, formatToApply: string, isStart: boolean): string {
    let formattedDate = '';
    if (initialDate) {
        if (Array.isArray(initialDate)) {
            formattedDate = format(initialDate[isStart ? 0 : 1], formatToApply);
        } else {
            formattedDate = format(initialDate, formatToApply);
        }
    }
    return formattedDate;
}

/**
 * Combines a given date and time into a Date or [Date, Date] object
 *
 * @param date - the date(s) to have time added to
 * @param time - the time(s) to add to the date(s)
 */
function getNewDatetime(date: DatepickerValue, time: TimeValue): DatepickerValue {
    if (!Array.isArray(date) && !Array.isArray(time)) {
        const [hours, minutes] = time?.split(':') ?? ['00', '00'];
        const newDate = date ? new Date(date.setHours(Number(hours), Number(minutes))) : null;
        return newDate;
    }
    const [startHours, startMinutes] = time[0]?.split(':') ?? ['00', '00'];
    const [endHours, endMinutes] = time[1]?.split(':') ?? ['00', '00'];
    const dates = date as [Date, Date];
    const startDate = dates[0] ? new Date(dates[0].setHours(Number(startHours), Number(startMinutes))) : null;
    const endDate = dates[1] ? new Date(dates[1].setHours(Number(endHours), Number(endMinutes))) : null;
    return [startDate, endDate];
}

/**
 * A simple datepicker component
 *
 * @param {DatePickerProps} props - the component props
 */
function DatePicker(props: DatePickerProps): JSX.Element {
    const value = props.value ?? props.initialValue;
    const [selectedDate, setSelectedDate] = useState<DatepickerValue>(
        value || (props.selectsRange ? [null, null] : null)
    );
    const [selectedTime, setSelectedTime] = useState<TimeValue>(() => getInitialTime(value, props.selectsRange));
    const formatToApply = props.dateFormat ?? 'dd/MM/yyyy';
    const [startDate, setStartDate] = useState<string>(() => getInitialDate(value, formatToApply, true));
    const [endDate, setEndDate] = useState<string>(() => getInitialDate(value, formatToApply, false));
    // state to track which date is being selected based on the input which has been interacted with
    const [isSelectingStart, setIsSelectingStart] = useState<boolean>(null);

    // Keep state in refs so we can compare it in useEffect without subscribing
    const selectedDateRef = useRef(selectedDate);
    selectedDateRef.current = selectedDate;

    const datepickerRef = useRef(null);

    const extraProps = useMemo(() => {
        if (props.selectsRange) {
            const selectedDates = (selectedDate ?? [null, null]) as [Date, Date];
            let { minDate } = props;
            // If we are selecting the end date minDate becomes whatever the startDate is
            if (!isSelectingStart) {
                const [currentStartDate] = selectedDates;
                minDate = currentStartDate;
            }

            return {
                endDate: selectedDates[1],
                minDate,
                startDate: selectedDates[0],
            };
        }

        let date = selectedDate;
        // if datepicker can change between single datepicker and range then we need to adjust the date
        if (Array.isArray(selectedDate)) {
            [date] = selectedDate;
        }
        return {
            selected: date as Date,
        };
    }, [selectedDate, isSelectingStart, props]);

    const onChangeDate = (date: Date): void => {
        // close datepicker when a date is chosen
        if (props.shouldCloseOnSelect) {
            datepickerRef.current?.setOpen(false);
        }

        if (props.selectsRange) {
            // if range datepicker then update the correct part of the selected date
            let currentStartDate;
            let currentEndDate;

            if (isSelectingStart) {
                currentStartDate = date;
                currentEndDate = Array.isArray(selectedDate) ? selectedDate[1] : null;
                // if start date happens after end date then end date should become start
                currentEndDate = currentEndDate && currentEndDate > date ? currentEndDate : date;
            } else {
                currentStartDate = Array.isArray(selectedDate) ? selectedDate[0] : null;
                currentEndDate = date;
            }

            setStartDate(format(currentStartDate, formatToApply));
            setEndDate(format(currentEndDate, formatToApply));
            setSelectedDate([currentStartDate, currentEndDate]);
        } else {
            // if it is a single datepicker just update the selected date and start date
            setSelectedDate(date);
            setStartDate(format(date, formatToApply));
        }
    };

    const onChangeDateInput = (isStartDate: boolean, e: React.SyntheticEvent<HTMLInputElement, Event>): void => {
        const target = e.target as HTMLInputElement;
        const newDate = parse(target.value, formatToApply, new Date());
        // if newDate is valid and within valid range then update the selected date
        if (
            newDate instanceof Date &&
            !Number.isNaN(newDate.valueOf()) &&
            !(newDate < props.minDate) &&
            !(newDate > props.maxDate)
        ) {
            // allows so that changes to the input update the datepicker
            datepickerRef.current?.setState({
                preSelection: newDate,
            });
            // if it is a range datepicker
            if (Array.isArray(selectedDate)) {
                if (isStartDate) {
                    let end = selectedDate[1];
                    // is start date is after end date, then adjust end date
                    if (newDate > end) {
                        end = newDate;
                        setEndDate(target.value);
                    }
                    setSelectedDate([newDate, end]);
                    setStartDate(target.value);
                    return;
                }

                let start = selectedDate[0];
                // if end date is before start date, then adjust start date
                if (newDate < start) {
                    start = newDate;
                    setStartDate(target.value);
                }

                setSelectedDate([start, newDate]);
                setEndDate(target.value);
                return;
            }
            setSelectedDate(newDate);
        }
        // if input date is not valid, user might still be inputting -> update input
        if (!isStartDate) {
            setEndDate(target.value);
            return;
        }
        setStartDate(target.value);
    };

    const onChangeTime = (time: string, isStartTime: boolean): void => {
        // only change if there is a time set, in the event of erasing does not update
        if (time) {
            if (Array.isArray(selectedTime)) {
                if (isStartTime) {
                    setSelectedTime([time, selectedTime[1]]);
                    return;
                }
                setSelectedTime([selectedTime[0], time]);
                return;
            }
            setSelectedTime(time);
        }
    };

    // this component is complex and so to make it work with controlled mode we are doing so in the useEffect for simplicity,
    // even if it is not the strictest way as it still keep track of its own state.
    useEffect(() => {
        const newValue = props.value ?? props.initialValue;

        const newDate = newValue || (props.selectsRange ? [null, null] : null);

        // Skip if the value is the same as the current state, this is necessary to prevent loops
        if (JSON.stringify(newDate) === JSON.stringify(selectedDateRef.current)) {
            return;
        }

        setSelectedDate(newDate);

        const newTime = getInitialTime(newValue, props.selectsRange);
        setSelectedTime(newTime);

        const newStartDate = getInitialDate(newValue, formatToApply, true);
        setStartDate(newStartDate);

        const newEndDate = getInitialDate(newValue, formatToApply, false);
        setEndDate(newEndDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.value, props.initialValue]);

    useEffect(() => {
        let time = selectedTime;
        // if datepicker can change between single datepicker and range then we need to adjust the time
        if (props.selectsRange && !Array.isArray(selectedTime)) {
            time = [selectedTime, '00:00'];
            setSelectedTime([selectedTime, '00:00']);
        }
        // We have to typecast to make compiler happy as we don't know which type it is at this point
        const newDateTime = getNewDatetime(selectedDate, time);
        props.onChange?.(newDateTime as Date & [Date, Date]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, selectedTime]);

    return (
        <>
            <Tooltip content={props.errorMsg} disabled={!props.errorMsg} styling="error">
                <DatepickerWrapper
                    inline={props.inline}
                    showsRange={props.selectsRange}
                    showsTime={props.showTimeInput}
                >
                    <DatepickerInputs>
                        <DateTimeWrapper isRange={props.selectsRange}>
                            <DateInput
                                isTimeRange={props.selectsRange && props.showTimeInput}
                                onChange={(e) => {
                                    onChangeDateInput(true, e);
                                }}
                                onClick={() => {
                                    setIsSelectingStart(true);
                                    datepickerRef.current?.setOpen(true);
                                }}
                                onFocus={() => {
                                    setIsSelectingStart(true);
                                    datepickerRef.current?.setOpen(true);
                                }}
                                onKeyDown={(e) => {
                                    datepickerRef.current?.onInputKeyDown(e);
                                }}
                                placeholder={formatToApply}
                                value={startDate}
                            />
                            {props.showTimeInput && (
                                <TimeInput
                                    isRange={props.selectsRange}
                                    onChange={(e) => {
                                        onChangeTime(e, true);
                                    }}
                                    type="time"
                                    value={Array.isArray(selectedTime) ? selectedTime[0] : selectedTime}
                                />
                            )}
                        </DateTimeWrapper>
                        {props.selectsRange && (
                            <EndDateInputWrapper>
                                &rarr;
                                <DateTimeWrapper isRange>
                                    <DateInput
                                        isTimeRange={props.showTimeInput}
                                        onChange={(e) => {
                                            onChangeDateInput(false, e);
                                        }}
                                        onClick={() => {
                                            setIsSelectingStart(false);
                                            datepickerRef.current?.setOpen(true);
                                        }}
                                        onFocus={() => {
                                            setIsSelectingStart(false);
                                            datepickerRef.current?.setOpen(true);
                                        }}
                                        onKeyDown={(e) => {
                                            datepickerRef.current?.onInputKeyDown(e);
                                        }}
                                        placeholder={formatToApply}
                                        value={endDate}
                                    />
                                    {props.showTimeInput && (
                                        <TimeInput
                                            isRange
                                            onChange={(e) => {
                                                onChangeTime(e, false);
                                            }}
                                            type="time"
                                            value={selectedTime[1]}
                                        />
                                    )}
                                </DateTimeWrapper>
                            </EndDateInputWrapper>
                        )}
                    </DatepickerInputs>
                    <ReactDatePicker
                        className={props.className}
                        // if needs to have a customInput otherwise displays its own
                        customInput={<div />}
                        disabled={props.disabled}
                        inline={props.inline}
                        maxDate={props.maxDate}
                        onChange={onChangeDate}
                        ref={datepickerRef}
                        selectsEnd={!isSelectingStart}
                        selectsStart={isSelectingStart}
                        shouldCloseOnSelect={props.shouldCloseOnSelect}
                        {...extraProps}
                        popperProps={{ strategy: props.popperStrategy ?? 'absolute' }}
                        renderCustomHeader={(headerProps) => (
                            <DatePickerHeader
                                {...headerProps}
                                maxDate={props.maxDate}
                                minDate={props.minDate}
                                portalsRef={props.portalsRef}
                                selectItemClass={props.selectItemClass}
                            />
                        )}
                    />
                </DatepickerWrapper>
            </Tooltip>
        </>
    );
}

export default DatePicker;
