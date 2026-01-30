import {
    type AnyVariable,
    type DerivedVariable,
    type NestedKey,
    type NormalizedPayload,
    type ResolvedDerivedVariable,
    isDerivedVariable,
    isResolvedDerivedVariable,
    isResolvedSwitchVariable,
} from '@/types';
import { isLoopVariable } from '@/types/utils';

/* eslint-disable no-underscore-dangle */
type Mapping = Record<string, any>;
type JsonArray = Array<JsonLike | string | number>;
type JsonLike = Mapping | JsonArray;

interface Placeholder {
    __ref: string;
}

function isPlaceholder(value: any): value is Placeholder {
    return typeof value === 'object' && '__ref' in value;
}

/**
 * Serialize a nested key for identifier computation.
 * Handles both string keys and LoopVariable objects.
 */
function serializeNestedKey(key: NestedKey): string {
    if (typeof key === 'string') {
        return key;
    }
    // It's a LoopVariable
    if (isLoopVariable(key)) {
        const loopNested = key.nested.join(',');
        return `LoopVar:${key.uid}:${loopNested}`;
    }
    return String(key);
}

export function getIdentifier(variable: AnyVariable<any>): string {
    let id = `${variable.__typename}:${variable.uid}`;

    if ('nested' in variable && variable.nested.length > 0) {
        id += `:${variable.nested.map(serializeNestedKey).join(',')}`;
    }

    return id;
}

function getEntries(obj: JsonArray): IterableIterator<[number, string | number | JsonLike]>;
function getEntries(obj: Mapping): [string, any][];
/**
 * Get an iterable of entries of array or object
 *
 * @param obj json-like array or object
 */
function getEntries(obj: JsonLike): Iterable<any> {
    if (Array.isArray(obj)) {
        return obj.entries();
    }

    return Object.entries(obj);
}

export function denormalize(obj: Mapping, lookup: Mapping): Mapping;
export function denormalize(obj: JsonArray, lookup: Mapping): JsonArray;
export function denormalize<T extends string | number | boolean>(obj: T, lookup: Mapping): T;

/**
 * Denormalize data by replacing Placeholders with objects from lookup
 *
 * @param obj JSON-like structure containing placeholders
 * @param lookup map of identifier -> referrable
 */
export function denormalize(obj: JsonLike, lookup: Mapping): Mapping | JsonArray | string | number | boolean {
    if (!obj) {
        return obj;
    }

    if (isPlaceholder(obj)) {
        const referrable = lookup[obj.__ref];
        return denormalize(referrable, lookup);
    }

    // Primitives (strings, numbers, booleans) should be returned as-is
    if (typeof obj !== 'object') {
        return obj;
    }

    const output: Record<string | number, any> = Array.isArray(obj) ? [] : {};

    for (const [key, val] of getEntries(obj)) {
        if (val !== null && typeof val === 'object') {
            output[key] = denormalize(val, lookup);
        } else {
            output[key] = val;
        }
    }

    return output;
}

/**
 * Normalize a ResolvedDerivedVariable object
 *
 * @param resolved resolved derived variable object
 * @param def variable definition
 */
function normalizeResolvedDerivedVariable(
    resolved: ResolvedDerivedVariable,
    def: DerivedVariable
): NormalizedPayload<any> {
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    const normalizedValues: Array<any | ResolvedDerivedVariable> = [];
    let lookup: Record<string, any> = {};

    for (const [key, val] of resolved.values.entries()) {
        // Recursively call normalize on resolve derived variables
        if (isResolvedDerivedVariable(val)) {
            const { data: nestedNormalized, lookup: nestedLookup } = normalizeResolvedDerivedVariable(
                val,
                def.variables[key] as DerivedVariable
            );
            normalizedValues.push(nestedNormalized);
            lookup = {
                ...lookup,
                ...nestedLookup,
            };
        } else if (isResolvedSwitchVariable(val)) {
            // For switch variables, normalize the constituent parts
            const varDef = def.variables[key]!;
            const identifier = getIdentifier(varDef);
            lookup[identifier] = val;
            normalizedValues.push({ __ref: identifier });
        } else {
            // Put values into lookup
            const varDef = def.variables[key]!;
            const identifier = getIdentifier(varDef);
            lookup[identifier] = val === undefined ? null : val;
            normalizedValues.push({ __ref: identifier });
        }
    }

    return {
        data: {
            ...resolved,
            values: normalizedValues,
        },
        lookup,
    };
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type DerivedVariableRequest = Array<ResolvedDerivedVariable | any>;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type PyComponentRequest = Record<string, ResolvedDerivedVariable | any>;

/**
 * Normalize py_component request data into a NormalizedPayload.
 * Puts all variable values into a lookup object to prevent data duplication.
 *
 * @param values resolved values
 * @param kwargsDefinition raw kwarg definition object
 */
export function normalizeRequest(
    values: PyComponentRequest | DerivedVariableRequest,
    kwargsDefinition: Record<string, AnyVariable<any>> | Array<AnyVariable<any>>
): NormalizedPayload<Record<string | number, any>> {
    const data: Record<string | number, any> = Array.isArray(values) ? [] : {};
    let lookup: Record<string, any> = {};

    // Iterate through both kwargs def and values
    // Where a plain Variable is found, put value to lookup
    for (const [key, val] of getEntries(values)) {
        const kwargDef: AnyVariable<any> = (kwargsDefinition as any)[key];

        // If no def is found, i.e. a static kwarg in PyComponent
        if (!kwargDef) {
            data[key] = val;
        } else if (isDerivedVariable(kwargDef)) {
            // Handle resolved derived variable
            const { data: nestedData, lookup: nestedLookup } = normalizeResolvedDerivedVariable(val, kwargDef);
            data[key] = nestedData;
            lookup = {
                ...lookup,
                ...nestedLookup,
            };
        } else if (kwargDef.constructor === Object) {
            const identifier = getIdentifier(kwargDef);
            lookup[identifier] = val === undefined ? null : val;
            data[key] = { __ref: identifier };
        } else {
            // If constructor is not an Object then it is the case of normalizing a static value
            data[key] = val;
        }
    }

    return {
        data,
        lookup,
    };
}
