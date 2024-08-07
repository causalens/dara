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

/* eslint-disable max-classes-per-file */

/* eslint-disable react/prefer-stateless-function */
import { HandlesProps, RailProps, TracksProps } from 'react-compound-slider';

// Override the types for the react-compound-slider package, updating the render return type to match @types/react@18
declare module 'react-compound-slider' {
    export class Rail extends React.Component<RailProps> {
        render():
            | string
            | number
            | boolean
            | React.ReactElement<
                  any,
                  | string
                  | ((
                        props: any
                    ) => React.ReactElement<
                        any,
                        string | any | (new (props: any) => React.Component<any, any, any>)
                    > | null)
                  | (new (props: any) => React.Component<any, any, any>)
              >
            | React.ReactPortal
            | null
            | undefined;
    }

    export class Handles extends React.Component<HandlesProps> {
        render():
            | string
            | number
            | boolean
            | React.ReactElement<
                  any,
                  | string
                  | ((
                        props: any
                    ) => React.ReactElement<
                        any,
                        string | any | (new (props: any) => React.Component<any, any, any>)
                    > | null)
                  | (new (props: any) => React.Component<any, any, any>)
              >
            | React.ReactPortal
            | null
            | undefined;
    }

    export class Tracks extends React.Component<TracksProps> {
        render():
            | string
            | number
            | boolean
            | React.ReactElement<
                  any,
                  | string
                  | ((
                        props: any
                    ) => React.ReactElement<
                        any,
                        string | any | (new (props: any) => React.Component<any, any, any>)
                    > | null)
                  | (new (props: any) => React.Component<any, any, any>)
              >
            | React.ReactPortal
            | null
            | undefined;
    }
}
