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
import shortid from 'shortid';
import { useImmer } from 'use-immer';

import { useUpdateEffect } from '@darajs/ui-utils';

import { EdgeConstraint, EdgeConstraintItem, EdgeConstraintType } from '../types';

/**
 * Parse edge constraints into internal representation
 *
 * @param constraints edge constraints to parse
 */
export function parseConstraints(constraints: EdgeConstraint[]): EdgeConstraintItem[] {
    return constraints.map((c) => {
        let constraintType = c.type;

        switch (constraintType) {
            // These are handled fine, leave as-is
            case EdgeConstraintType.HARD_DIRECTED:
            case EdgeConstraintType.SOFT_DIRECTED:
            case EdgeConstraintType.FORBIDDEN:
            case EdgeConstraintType.UNDIRECTED:
                break;

            // Other unsupported types - use undirected
            default: {
                constraintType = EdgeConstraintType.UNDIRECTED;
                break;
            }
        }

        return {
            id: shortid.generate(),
            source: c.source,
            target: c.target,
            type: constraintType,
        };
    });
}

/**
 * Parse internal edge constraint items to external representation
 *
 * @param constraintItems edge constraint items to parse
 */
export function parseConstraintItems(constraintItems: EdgeConstraintItem[]): EdgeConstraint[] {
    return constraintItems.map((c) => {
        const { id, ...rest } = c;
        return rest;
    });
}

interface EdgeConstraintEncoderApi {
    /**
     * Add a new constraint
     */
    addConstraint: (source?: string, target?: string) => void;
    /**
     * Current constraints
     */
    constraints: EdgeConstraintItem[];
    /**
     * Remove a constraint with the given id
     */
    removeConstraint: (id: string) => void;
    /**
     * Reverse a given constraint - switch source and target
     */
    reverseConstraint: (edgeConstraint: EdgeConstraintItem) => void;
    /**
     * Update given constraint
     */
    updateConstraint: (edgeConstraint: EdgeConstraintItem) => void;
}

/**
 * Hook exposing common logic to manage edge constraints
 * Can be re-used with different frontends to maintain the same functionality
 *
 * @param initialConstraints Initial constraints to show
 * @param onUpdate Handler called whenever constraints are updated
 */
export function useEdgeConstraintEncoder(
    initialConstraints: EdgeConstraint[],
    onUpdate?: (constraints: EdgeConstraint[]) => void | Promise<void>
): EdgeConstraintEncoderApi {
    const [constraints, setConstraints] = useImmer<EdgeConstraintItem[]>(() =>
        initialConstraints ? parseConstraints(initialConstraints) : []
    );

    useUpdateEffect(() => {
        onUpdate?.(parseConstraintItems(constraints));
    }, [constraints]);

    function updateConstraint(edgeConstraint: EdgeConstraintItem): void {
        setConstraints((draft) => {
            const index = draft.findIndex((c) => c.id === edgeConstraint.id);
            draft[index] = edgeConstraint;
        });
    }

    function addConstraint(source?: string, target?: string): void {
        setConstraints((draft) => {
            draft.push({
                id: shortid.generate(),
                source: source ?? null,
                target: target ?? null,
                type: EdgeConstraintType.UNDIRECTED,
            });
        });
    }

    function removeConstraint(id: string): void {
        setConstraints((draft) => {
            const index = draft.findIndex((c) => c.id === id);
            draft.splice(index, 1);
        });
    }

    function reverseConstraint(edgeConstraint: EdgeConstraintItem): void {
        setConstraints((draft) => {
            const index = draft.findIndex((c) => c.id === edgeConstraint.id);

            // Reverse source and target
            draft[index].source = edgeConstraint.target;
            draft[index].target = edgeConstraint.source;
        });
    }

    return {
        addConstraint,
        constraints,
        removeConstraint,
        reverseConstraint,
        updateConstraint,
    };
}
