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
import { Status } from './constants';

interface Colors {
    error: string;
    primary: string;
    success: string;
    warning: string;
}

/**
 * Helper function to get the color (as a hex string) for a given status
 *
 * @param status the status to display
 * @param theme the styled components theme from context
 */
const getStatusColor = (status: Status, colors: Colors): string => {
    if ([Status.ERROR, Status.FAILED].includes(status)) {
        return colors.error;
    }
    if ([Status.CANCELED, Status.WARNING].includes(status)) {
        return colors.warning;
    }
    return status === Status.SUCCESS ? colors.success : colors.primary;
};

export default getStatusColor;
