import { DefaultTheme } from '@darajs/styled-components';
import { GraphLegendDefinition } from '@darajs/ui-causal-graph-editor';

function getThemeColor(theme: DefaultTheme, colorString: string): string {
    return theme.colors[colorString.replace('theme.', '') as keyof DefaultTheme['colors']];
}

function isNodeLegend(legend: GraphLegendDefinition): legend is Extract<GraphLegendDefinition, { type: 'node' }> {
    return legend.type === 'node';
}

function isEdgeLegend(legend: GraphLegendDefinition): legend is Extract<GraphLegendDefinition, { type: 'edge' }> {
    return legend.type === 'edge';
}

export function transformLegendColor(theme: DefaultTheme, legend: GraphLegendDefinition): GraphLegendDefinition {
    if (isEdgeLegend(legend)) {
        const transformedLegend: GraphLegendDefinition = {
            ...legend,
            color: legend.color?.startsWith('theme') ? getThemeColor(theme, legend.color) : legend.color,
        };
        return transformedLegend;
    }
    if (isNodeLegend(legend)) {
        const transformedLegend: GraphLegendDefinition = {
            ...legend,
            color: legend.color?.startsWith('theme') ? getThemeColor(theme, legend.color) : legend.color,
            highlight_color: legend.highlight_color?.startsWith('theme')
                ? getThemeColor(theme, legend.highlight_color)
                : legend.highlight_color,
        };
        return transformedLegend;
    }
    // For 'spacer' we don't need to transform anything
    return legend;
}
