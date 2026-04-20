import { format, parseISO } from 'date-fns';

import { type StyledComponentProps, type Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';

const LocalizedDateWrapper = styled.div``;
const StyledLocalizedDate = injectCss(LocalizedDateWrapper);

interface LocalizedDateProps extends StyledComponentProps {
    /** The date as an ISO string */
    date: string | Variable<string>;
    /** date-fns format string, defaults to 'yyyy-MM-dd HH:mm' */
    format?: string;
}

/**
 * A component that renders an ISO date string formatted in the user's local timezone,
 * using date-fns format tokens.
 *
 * @param props the component props
 */
function LocalizedDate(props: LocalizedDateProps): JSX.Element {
    const { date, format: formatString = 'yyyy-MM-dd HH:mm' } = props;
    const [style, css] = useComponentStyles(props);
    const [dateStr] = useVariable(date);

    const parsedDate = parseISO(dateStr);
    const formattedDate = format(parsedDate, formatString);

    return (
        <StyledLocalizedDate $rawCss={css} style={style} id={props.id_}>
            {formattedDate}
        </StyledLocalizedDate>
    );
}

export default LocalizedDate;
