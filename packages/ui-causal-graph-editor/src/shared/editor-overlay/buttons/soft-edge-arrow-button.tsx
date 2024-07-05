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

function SoftEdgeArrowButton(): JSX.Element {
    return (
        <svg fill="none" height="15" viewBox="0 0 16 15" width="16" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M9.1333 0.867188C10.9545 0.867188 12.701 1.59064 13.9888 2.87839C15.2765 4.16614 16 5.9127 16 7.73385C16 9.55501 15.2765 11.3016 13.9888 12.5893C12.701 13.8771 10.9545 14.6005 9.1333 14.6005L9.1333 12.2659C10.3353 12.2659 11.488 11.7884 12.3379 10.9385C13.1878 10.0885 13.6653 8.93581 13.6653 7.73385C13.6653 6.53189 13.1878 5.37916 12.3379 4.52925C11.488 3.67933 10.3353 3.20185 9.1333 3.20185V0.867188Z"
                fill="currentColor"
            />
            <path
                d="M1.14286 6.59375H14.1667V8.87946H1.14286C0.510714 8.87946 0 8.36875 0 7.73661C0 7.10446 0.510714 6.59375 1.14286 6.59375Z"
                fill="currentColor"
            />
            <circle cx="9.13389" cy="2.03452" fill="currentColor" r="1.16733" />
            <circle cx="9.13389" cy="13.4344" fill="currentColor" r="1.16733" />
        </svg>
    );
}

export default SoftEdgeArrowButton;
