import { type DefaultTheme } from '@darajs/styled-components';
import { type GraphLegendDefinition } from '@darajs/ui-causal-graph-editor';

/**
 * Based on a color string, return the color from the theme if it starts with 'theme.'
 *
 * @param theme the currently active theme
 * @param colorString the string passed to the color property
 */
function getThemeColor(theme: DefaultTheme, colorString: string): string {
    if (colorString.startsWith('theme')) {
        return theme.colors[colorString.replace('theme.', '') as keyof DefaultTheme['colors']];
    }
    return colorString;
}

/**
 * Tranform the color properties of a legend object to use the theme colors if necessary
 *
 * @param theme the currently active theme
 * @param legend a legend object
 */
export function transformLegendColor(theme: DefaultTheme, legend: GraphLegendDefinition): GraphLegendDefinition {
    if (legend.type === 'edge') {
        const transformedLegend: GraphLegendDefinition = {
            ...legend,
            color: getThemeColor(theme, legend?.color),
        };
        return transformedLegend;
    }
    if (legend.type === 'node') {
        const transformedLegend: GraphLegendDefinition = {
            ...legend,
            color: getThemeColor(theme, legend?.color),
            highlight_color: getThemeColor(theme, legend?.highlight_color),
        };
        return transformedLegend;
    }
    // For 'spacer' we don't need to transform anything
    return legend;
}
