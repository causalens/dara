import { format, isValid, parseISO } from 'date-fns';

import { type StyledComponentProps, type Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';

const LocalizedDateWrapper = styled.div``;
const StyledLocalizedDate = injectCss(LocalizedDateWrapper);

interface LocalizedDateProps extends StyledComponentProps {
    /** The date as an ISO string */
    date: string | Variable<string>;
    /** date-fns format string, defaults to 'yyyy-MM-dd HH:mm' */
    format?: string | Variable<string>;
    /** Value displayed when the date is missing or cannot be parsed, defaults to an empty string */
    placeholder?: string | Variable<string>;
}

/**
 * A component that renders an ISO date string formatted in the user's local timezone,
 * using date-fns format tokens.
 *
 * When the incoming `date` is empty or cannot be parsed, the component renders `placeholder`
 * and sets `data-state="error"` on the wrapper so the error state can be targeted via
 * `raw_css`, e.g. `raw_css='&[data-state="error"] { color: red; }'`.
 *
 * @param props the component props
 */
function LocalizedDate(props: LocalizedDateProps): JSX.Element {
    const { date, format: formatString = 'yyyy-MM-dd HH:mm', placeholder = '' } = props;
    const [style, css] = useComponentStyles(props);
    const [dateStr] = useVariable(date);
    const [formatStr] = useVariable(formatString);
    const [placeholderStr] = useVariable(placeholder);

    const parsedDate = dateStr ? parseISO(dateStr) : null;
    const isError = !parsedDate || !isValid(parsedDate);
    const content = isError ? placeholderStr : format(parsedDate, formatStr);

    return (
        <StyledLocalizedDate
            $rawCss={css}
            data-state={isError ? 'error' : 'ok'}
            id={props.id_}
            style={style}
        >
            {content}
        </StyledLocalizedDate>
    );
}

export default LocalizedDate;
