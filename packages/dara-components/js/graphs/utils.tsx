import { DefaultTheme } from '@darajs/styled-components';
import { GraphLegendDefinition } from '@darajs/ui-causal-graph-editor';

function getThemeColor(theme: DefaultTheme, colorString: string): string {
    if (colorString.startsWith('theme')) {
        return theme.colors[colorString.replace('theme.', '') as keyof DefaultTheme['colors']];
    }
    return colorString;
}

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
