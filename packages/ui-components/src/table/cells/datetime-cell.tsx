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
import { format, parseISO } from 'date-fns';

/** Interface is very loose because react table basically lets anything go through here */
interface DateCellProps {
    value: any;
}

/**
 * A date formatting cell that will accept native JS date objects and render them according to a string format
 *
 * @param fmt the date format to render the Date as
 */
function DatetimeCell(fmt = 'yyyy-MM-dd HH:mm'): (props: DateCellProps) => string {
    return ({ value }: DateCellProps): string => {
        if (!value) {
            return '';
        }

        const parsed = parseISO(value);
        if (Number.isNaN(parsed.getTime())) {
            return '';
        }

        return format(parsed, fmt);
    };
}

export default DatetimeCell;
