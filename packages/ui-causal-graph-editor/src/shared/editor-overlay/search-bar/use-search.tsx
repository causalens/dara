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
import { SetStateAction, useEffect, useState } from 'react';

import { SimulationGraph } from '../../../types';

interface UseSearchInput {
    graph: SimulationGraph;
    setSelectedNode: (value: SetStateAction<string>) => void;
}

interface UseSearchOutput {
    currentSearchNode: number;
    onNextSearchResult: () => void | Promise<void>;
    onPrevSearchResult: () => void | Promise<void>;
    onSearchBarChange: (value?: string) => void | Promise<void>;
    searchResults: string[];
}

function useSearch({ graph, setSelectedNode }: UseSearchInput): UseSearchOutput {
    const [searchResults, setSearchResults] = useState<string[]>([]);
    const [currentSearchNode, setCurrentSearchNode] = useState(0);

    const [searchValue, setSearchValue] = useState('');

    const updateSearchResults =
        (setActiveNode = true) =>
        (value?: string): void => {
            setSearchValue(value);
            if (!value) {
                setSearchResults([]);
                if (setActiveNode) {
                    setCurrentSearchNode(0);
                    setSelectedNode(null);
                }

                return;
            }

            const searchValueClean = value.trim().toLowerCase();

            const filteredNodes = graph
                .mapNodes((id, data) => {
                    const idIncludesValue = id.toLowerCase().includes(searchValueClean);
                    const hasLabelWhichIncludesValue =
                        data['meta.rendering_properties.label'] &&
                        data['meta.rendering_properties.label'].toLowerCase().includes(searchValueClean);

                    return idIncludesValue || hasLabelWhichIncludesValue ? id : undefined;
                })
                .filter(Boolean);

            setSearchResults(filteredNodes);

            if (setActiveNode) {
                setCurrentSearchNode(0);
                setSelectedNode(filteredNodes.length > 0 ? filteredNodes[0] : null);
            }
        };

    const onSearchBarChange = updateSearchResults();

    function onNextSearchResult(): void {
        const totalNumberOfResults = searchResults.length;
        const newIndex = (currentSearchNode + 1) % totalNumberOfResults;
        setCurrentSearchNode(newIndex);
        setSelectedNode(searchResults[newIndex]);
    }
    function onPrevSearchResult(): void {
        const totalNumberOfResults = searchResults.length;
        let newIndex = (currentSearchNode - 1) % totalNumberOfResults;
        if (newIndex < 0) {
            newIndex += totalNumberOfResults;
        }
        setCurrentSearchNode(newIndex);
        setSelectedNode(searchResults[newIndex]);
    }

    useEffect(() => {
        updateSearchResults(false)(searchValue);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graph]);

    return {
        currentSearchNode,
        onNextSearchResult,
        onPrevSearchResult,
        onSearchBarChange,
        searchResults,
    };
}

export default useSearch;
