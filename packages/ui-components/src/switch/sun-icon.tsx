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
import { useTheme } from '@darajs/styled-components';

function Sun(): JSX.Element {
    const theme = useTheme();
    return (
        <div style={{ display: 'flex', height: '1rem', width: '1rem' }}>
            <svg fill="none" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <path
                    d="M138 100C138 120.987 120.987 138 100 138C79.0132 138 62 120.987 62 100C62 79.0132 79.0132 62 100 62C120.987 62 138 79.0132 138 100Z"
                    fill={theme.colors.background}
                />
                <path
                    d="M87 13C87 5.8203 92.8203 0 100 0C107.18 0 113 5.8203 113 13V31C113 38.1797 107.18 44 100 44C92.8203 44 87 38.1797 87 31V13Z"
                    fill={theme.colors.background}
                />
                <path
                    d="M87 169C87 161.82 92.8203 156 100 156C107.18 156 113 161.82 113 169V187C113 194.18 107.18 200 100 200C92.8203 200 87 194.18 87 187V169Z"
                    fill={theme.colors.background}
                />
                <path
                    d="M169 113C161.82 113 156 107.18 156 100C156 92.8203 161.82 87 169 87H187C194.18 87 200 92.8203 200 100C200 107.18 194.18 113 187 113H169Z"
                    fill={theme.colors.background}
                />
                <path
                    d="M13 113C5.8203 113 0 107.18 0 100C0 92.8203 5.8203 87 13 87H31C38.1797 87 44 92.8203 44 100C44 107.18 38.1797 113 31 113H13Z"
                    fill={theme.colors.background}
                />
                <path
                    d="M28.1924 46.5772C23.1156 41.5003 23.1156 33.2692 28.1924 28.1924C33.2692 23.1156 41.5003 23.1156 46.5772 28.1924L59.3051 40.9203C64.3819 45.9971 64.3819 54.2283 59.3051 59.3051C54.2283 64.3819 45.9971 64.3819 40.9203 59.3051L28.1924 46.5772Z"
                    fill={theme.colors.background}
                />
                <path
                    d="M159.579 59.3051C154.502 64.3819 146.271 64.3819 141.194 59.3051C136.118 54.2283 136.118 45.9972 141.194 40.9203L153.922 28.1924C158.999 23.1156 167.23 23.1156 172.307 28.1924C177.384 33.2692 177.384 41.5004 172.307 46.5772L159.579 59.3051Z"
                    fill={theme.colors.background}
                />
                <path
                    d="M141.192 159.577C136.116 154.5 136.116 146.269 141.192 141.192C146.269 136.116 154.5 136.116 159.577 141.192L172.305 153.92C177.382 158.997 177.382 167.228 172.305 172.305C167.228 177.382 158.997 177.382 153.92 172.305L141.192 159.577Z"
                    fill={theme.colors.background}
                />
                <path
                    d="M40.9209 141.192C45.9977 136.116 54.2289 136.116 59.3057 141.192C64.3825 146.269 64.3825 154.5 59.3057 159.577L46.5777 172.305C41.5009 177.382 33.2698 177.382 28.193 172.305C23.1162 167.228 23.1162 158.997 28.193 153.92L40.9209 141.192Z"
                    fill={theme.colors.background}
                />
            </svg>
        </div>
    );
}

export default Sun;
