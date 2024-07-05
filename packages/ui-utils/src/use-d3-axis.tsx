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
import { ScaleLinear, ScaleTime, scaleLinear, scaleTime } from 'd3-scale';
import { useCallback, useMemo } from 'react';

import useDeepCompare from './use-deep-compare';

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type AxisDomain = string | number | 'auto' | 'dataMin' | 'dataMax';

interface AxisProps<T> {
    domain?: [T, T];
    tickFormatter: (tick?: number) => string;
    ticks?: Array<number>;
    type: 'number' | 'category';
}

/**
 * An underlying helper hook that uses d3 to create a function for getting the axis properties for an axis based
 * on the pixel size of that axis. This hook should not be used directly, use one of the wrappers for it,
 * e.g. useD3LinearAxis or useD3TimeAxis
 *
 * @param data the underlying data for the axis
 * @param domain the target domain for the axis
 * @param getScale a function to get the d3Scale instance with domain applied
 * @param domainFormatter a function to translate the d3 domain back into a recharts domain
 */
export function useD3Axis<T>(
    data: Array<T>,
    getScale: (data: Array<T>, domain?: [T, T]) => any,
    domainFormatter: (domain: [any, any]) => [T, T],
    domain?: [T, T]
): (width?: number) => AxisProps<T> {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const valueScale = useMemo(() => getScale(data, domain), useDeepCompare([data, domain, getScale]));

    return useCallback(
        (axisSize: number): AxisProps<T> => {
            const scale = valueScale.range([0, axisSize]).nice();
            return {
                domain: domainFormatter(scale.domain()),
                tickFormatter: scale.tickFormat(),
                ticks: scale.ticks(),
                type: 'number',
            };
        },
        [domainFormatter, valueScale]
    );
}

/** Helper function for getting a linear d3Scale instance, based on data and domain */
const getLinearScale = (data: Array<number>, domain: [number, number]): ScaleLinear<number, number> => {
    return scaleLinear().domain([data ? Math.min(...data) : domain[0], data ? Math.max(...data) : domain[1]]);
};

/**
 * Hook that returns a function that generates the props for a linearly scaled axis based on the size in pixels of the
 * axis
 *
 * @param data the underlying data for the axis
 * @param domain the target domain for the axis
 */
export function useD3LinearAxis(
    data: Array<number>,
    domain?: [number, number]
): (axisSize?: number) => AxisProps<number> {
    return useD3Axis<number>(data, getLinearScale, (dm) => dm, domain);
}

/** Helper function for getting a time d3Scale instance, based on data and domain */
const getTimeScale = (data: Array<Date>, domain: [Date, Date]): ScaleTime<number, number> => {
    return scaleTime().domain([data ? data[0] : domain[0], data ? data[data.length - 1] : domain[1]]);
};

/**
 * Hook that returns a function that generates the props for a time scaled axis based on the size in pixels of the
 * axis
 *
 * @param data the underlying data for the axis
 * @param domain the target domain for the axis
 */
export function useD3TimeAxis(data: Array<Date>, domain?: [Date, Date]): (axisSize?: number) => AxisProps<Date> {
    return useD3Axis(data, getTimeScale, (dm) => dm, domain);
}

/**
 * Hook that returns a function that generates the props for an ordinal (categorical) scaled axis, doesn't actually use
 * the ordinal scale as it doesn't need to, but has the same returned api as the others so it can be substituted in.
 *
 * @param mapping a mapping dict that translates the numeric value to a label
 */
export function useD3OrdinalAxis(mapping: { [k: number]: string }): (axisSize?: number) => AxisProps<string> {
    return (): AxisProps<string> => ({
        tickFormatter: (tick: number): string => mapping[tick],
        type: 'category',
    });
}
