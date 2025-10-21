function cleanNewlines(value: string): string {
    return value
        .replace(/\\n/g, '\n') // Convert \n to actual newlines
        .replace(/\\+$/gm, ''); // Remove trailing backslashes at end of lines
}

/**
 * Parse an eval input/output value and return a display value and language
 * to use with json/text displays.
 *
 * Goes well with the custom extended-json extension.
 */
export function createDisplayValue(value: any): [value: string, lang: 'json' | 'text'] {
    if (typeof value === 'string') {
        const cleanValue = value.trim();
        // the value could be a stringified JSON because LLM inputs are stored this way
        const isPotentialJSON = cleanValue.startsWith('{') || cleanValue.startsWith('[');

        // if we suspect it's JSON, try to parse it
        if (isPotentialJSON) {
            try {
                const parsed = JSON.parse(cleanValue);
                const jsonString = JSON.stringify(parsed, null, 2);
                // Convert escaped newlines to actual newlines for better display
                const displayString = cleanNewlines(jsonString);
                return [displayString, 'json'];
            } catch {
                // Not valid JSON
            }
        }
        return [cleanValue, 'text'];
    }

    const jsonString = JSON.stringify(value ?? 'null', null, 2);
    // Convert escaped newlines to actual newlines for better display
    const displayString = cleanNewlines(jsonString);
    return [displayString, 'json'];
}
