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
import { act, renderHook, waitFor } from '@testing-library/react';
import times from 'lodash/times';

import useInfiniteLoader from './use-infinite-loader';

const data = times(100, (num: number) => ({
    id: `id_${num}`,
}));

const onLoadData = jest.fn(async (startIndex: number, stopIndex: number) => {
    return Promise.resolve({ data: data.slice(startIndex, stopIndex), totalCount: data.length });
});

describe('useInfiniteLoader', () => {
    it('should construct correctly and return a working interface', async () => {
        const { result } = renderHook(() => useInfiniteLoader(onLoadData));

        await waitFor(() => {
            expect(result.current.getItem(0)).toEqual({ id: 'id_0' });
            expect(result.current.getItem(9)).toEqual({ id: 'id_9' });
            expect(result.current.itemCount).toBe(100);
            expect(result.current.onItemsRendered).toBeInstanceOf(Function);
            expect(result.current.refresh).toBeInstanceOf(Function);
        });
    });

    it('should load more data and append to the end of the internal data store when neccesary', async () => {
        const { result } = renderHook(() => useInfiniteLoader(onLoadData));

        await waitFor(() => {
            expect(result.current.getItem(55)).toBeUndefined();
        });
        onLoadData.mockClear();

        act(() => {
            // Simulate scrolling down past the end of the currently loaded data
            result.current.onItemsRendered({ overscanStartIndex: 20, overscanStopIndex: 60 });
        });

        await waitFor(() => {
            expect(onLoadData).toHaveBeenCalledTimes(1);
            expect(onLoadData).toHaveBeenCalledWith(50, 100);
            expect(result.current.getItem(0)).toEqual({ id: 'id_0' });
            expect(result.current.getItem(55)).toEqual({ id: 'id_55' });
        });
    });

    it('should load more data and add to the start of the internal data store when neccesary', async () => {
        const { result } = renderHook(() => useInfiniteLoader(onLoadData));

        // This block acts to scroll down to the bottom of the page and then drop most of the loaded data using refresh
        act(() => {
            result.current.onItemsRendered({ overscanStartIndex: 80, overscanStopIndex: 100 });
        });
        await waitFor(() => {
            expect(result.current.getItem(80)).toEqual({ id: 'id_80' });
        });
        act(() => {
            result.current.refresh();
        });
        // Verify this has worked
        await waitFor(() => {
            expect(result.current.getItem(15)).toBeUndefined();
        });

        onLoadData.mockClear();

        act(() => {
            // Simulate scrolling up past the start of the currently loaded data
            result.current.onItemsRendered({ overscanStartIndex: 60, overscanStopIndex: 90 });
        });

        await waitFor(() => {
            expect(onLoadData).toHaveBeenCalledTimes(1);
        });

        expect(onLoadData).toHaveBeenCalledWith(15, 65); // These number are due to the way it calculates overscan
        expect(result.current.getItem(15)).toEqual({ id: 'id_15' });
    });

    it('should load more data and reset internal data store when jumping through the data', async () => {
        const { result } = renderHook(() => useInfiniteLoader(onLoadData));

        await waitFor(() => {
            expect(result.current.getItem(90)).toBeUndefined();
        });
        onLoadData.mockClear();

        act(() => {
            // Simulate jumping to the end of the data
            result.current.onItemsRendered({ overscanStartIndex: 80, overscanStopIndex: 100 });
        });

        await waitFor(() => {
            expect(onLoadData).toHaveBeenCalledTimes(1);
            expect(onLoadData).toHaveBeenCalledWith(65, 115); // These number are due to the way it calculates overscan
            expect(result.current.getItem(0)).toBeUndefined();
            expect(result.current.getItem(90)).toEqual({ id: 'id_90' });
        });
    });

    it('calling refresh should reset internal data and create a new window at the current scroll location', async () => {
        const { result } = renderHook(() => useInfiniteLoader(onLoadData));

        // This block acts to scroll to the end of the data window and then back to the middle so all the data is loaded
        act(() => {
            result.current.onItemsRendered({ overscanStartIndex: 40, overscanStopIndex: 100 });
            result.current.onItemsRendered({ overscanStartIndex: 40, overscanStopIndex: 60 });
        });

        // Verify this has worked
        await waitFor(() => {
            expect(result.current.getItem(15)).toEqual({ id: 'id_15' });
            expect(result.current.getItem(50)).toEqual({ id: 'id_50' });
            expect(result.current.getItem(90)).toEqual({ id: 'id_90' });
        });
        onLoadData.mockClear();

        act(() => {
            // Simulate refreshing the data from the backend, used when polling
            result.current.refresh();
        });

        await waitFor(() => {
            expect(onLoadData).toHaveBeenCalledTimes(1);
            expect(onLoadData).toHaveBeenCalledWith(25, 75); // These number are due to the way it calculates overscan
            expect(result.current.getItem(15)).toBeUndefined();
            expect(result.current.getItem(50)).toEqual({ id: 'id_50' });
            expect(result.current.getItem(90)).toBeUndefined();
        });
    });
});
