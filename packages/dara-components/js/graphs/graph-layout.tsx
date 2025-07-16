import {
    CircularLayout,
    CustomLayout,
    FcoseLayout,
    ForceAtlasLayout,
    GraphLayout,
    type GraphLayoutBuilder,
    type GroupingLayoutBuilder,
    MarketingLayout,
    PlanarLayout,
    SpringLayout,
    type TieredGraphLayoutBuilder,
} from '@darajs/ui-causal-graph-editor';

// Types mirror backend types defined in dara.components.graphs.graph_layout
type GraphLayoutType = 'marketing' | 'planar' | 'spring' | 'circular' | 'fcose' | 'force_atlas' | 'custom';

interface DefinitionWithTiers extends TieredGraphLayoutBuilder {
    tier_separation?: number;
}

interface BuilderWithTiers extends TieredGraphLayoutBuilder {
    tierSeparation?: (separation: number) => GraphLayoutBuilder<unknown>;
}
interface BaseGraphLayoutDefinition {
    layout_type: GraphLayoutType;
    node_font_size?: number;
    node_size?: number;
}

interface CircularLayoutDefinition extends BaseGraphLayoutDefinition {
    layout_type: 'circular';
}

interface CustomLayoutDefinition extends BaseGraphLayoutDefinition {
    layout_type: 'custom';
}

interface FcoseLayoutDefinition extends BaseGraphLayoutDefinition, DefinitionWithTiers, GroupingLayoutBuilder {
    edge_elasticity?: number;
    edge_length?: number;
    energy?: number;
    gravity?: number;
    gravity_range?: number;
    high_quality?: boolean;
    iterations?: number;
    layout_type: 'fcose';
    node_repulsion?: number;
    node_separation?: number;
}

interface ForceAtlasLayoutDefinition extends BaseGraphLayoutDefinition {
    barnes_hut_optimize?: boolean;
    edge_weight_influence?: number;
    gravity?: number;
    iterations?: number;
    layout_type: 'force_atlas';
    lin_log_mode?: boolean;
    outbound_attraction_distribution?: boolean;
    scaling_ratio?: number;
    strong_gravity_mode?: boolean;
}

interface MarketingLayoutDefinition extends BaseGraphLayoutDefinition, DefinitionWithTiers {
    layout_type: 'marketing';
    target_location?: MarketingLayout['targetLocation'];
}

interface PlanarLayoutDefinition extends BaseGraphLayoutDefinition, TieredGraphLayoutBuilder {
    layering_algorithm?: PlanarLayout['layeringAlgorithm'];
    layout_type: 'planar';
    orientation?: PlanarLayout['orientation'];
}

interface SpringLayoutDefinition extends BaseGraphLayoutDefinition, DefinitionWithTiers, GroupingLayoutBuilder {
    collision_force?: number;
    gravity?: number;
    layout_type: 'spring';
    link_force?: number;
    warmup_ticks: number;
    group_repel_strength?: number;
}

export type GraphLayoutDefinition =
    | CircularLayoutDefinition
    | CustomLayoutDefinition
    | FcoseLayoutDefinition
    | ForceAtlasLayoutDefinition
    | MarketingLayoutDefinition
    | PlanarLayoutDefinition
    | SpringLayoutDefinition;

function isDefinitionWithTiers(obj: any): obj is DefinitionWithTiers {
    return obj && typeof obj === 'object' && 'tiers' in obj;
}

function isDefinitionWithGroup(obj: any): obj is GroupingLayoutBuilder {
    return obj && typeof obj === 'object' && 'group' in obj;
}

/**
 * Parse a backend graph layout definition into a graph layout understood by the UI component
 *
 * @param definition backend layout definition
 */
export function parseLayoutDefinition(definition: GraphLayoutDefinition): GraphLayout {
    let builder;

    switch (definition.layout_type) {
        case 'circular': {
            builder = CircularLayout.Builder;

            break;
        }

        case 'custom': {
            builder = CustomLayout.Builder;

            break;
        }

        case 'fcose': {
            builder = FcoseLayout.Builder;

            if (definition.edge_elasticity) {
                builder.edgeElasticity(definition.edge_elasticity);
            }

            if (definition.edge_length) {
                builder.edgeLength(definition.edge_length);
            }

            if (definition.gravity) {
                builder.gravity(definition.gravity);
            }

            if (definition.gravity_range) {
                builder.gravityRange(definition.gravity_range);
            }

            if (definition.energy) {
                builder.energy(definition.energy);
            }

            if (definition.high_quality) {
                builder.highQuality(definition.high_quality);
            }

            if (definition.iterations) {
                builder.iterations(definition.iterations);
            }

            if (definition.node_repulsion) {
                builder.nodeRepulsion(definition.node_repulsion);
            }

            if (definition.node_separation) {
                builder.nodeSeparation(definition.node_separation);
            }

            break;
        }

        case 'force_atlas': {
            builder = ForceAtlasLayout.Builder;

            if (definition.barnes_hut_optimize) {
                builder.barnesHutOptimize(definition.barnes_hut_optimize);
            }

            if (definition.edge_weight_influence) {
                builder.edgeWeightInfluence(definition.edge_weight_influence);
            }

            if (definition.gravity) {
                builder.gravity(definition.gravity);
            }

            if (definition.iterations) {
                builder.iterations(definition.iterations);
            }

            if (definition.lin_log_mode) {
                builder.linLogMode(definition.lin_log_mode);
            }

            if (definition.outbound_attraction_distribution) {
                builder.outboundAttractionDistribution(definition.outbound_attraction_distribution);
            }

            if (definition.scaling_ratio) {
                builder.scalingRatio(definition.scaling_ratio);
            }

            if (definition.strong_gravity_mode) {
                builder.strongGravityMode(definition.strong_gravity_mode);
            }

            break;
        }

        case 'marketing': {
            builder = MarketingLayout.Builder;

            if (definition.target_location) {
                builder.targetLocation(definition.target_location);
            }

            break;
        }

        case 'planar': {
            builder = PlanarLayout.Builder;

            if (definition.orientation) {
                builder.orientation(definition.orientation);
            }

            if (definition.tiers) {
                builder.tiers(definition.tiers);
            }

            if (definition.layering_algorithm) {
                builder.layeringAlgorithm(definition.layering_algorithm);
            }

            break;
        }

        case 'spring': {
            builder = SpringLayout.Builder;

            if (definition.collision_force) {
                builder.collisionForce(definition.collision_force);
            }

            if (definition.gravity) {
                builder.gravity(definition.gravity);
            }

            if (definition.link_force) {
                builder.linkForce(definition.link_force);
            }

            if (definition.warmup_ticks) {
                builder.warmupTicks(definition.warmup_ticks);
            }

            if (definition.group_repel_strength) {
                builder.groupRepelStrength(definition.group_repel_strength);
            }

            break;
        }

        default: {
            throw new Error(`Unrecognized layout type: ${String((definition as any).layout_type)}`);
        }
    }

    if (isDefinitionWithTiers(definition)) {
        const builderWithTiers = builder as unknown as BuilderWithTiers;
        if (definition.tiers) {
            builderWithTiers.tiers = definition.tiers;
        }

        if (definition.orientation) {
            builderWithTiers.orientation = definition.orientation;
        }

        if (definition.tier_separation) {
            builderWithTiers.tierSeparation(definition.tier_separation);
        }
    }

    if (isDefinitionWithGroup(definition)) {
        const builderWithGroup = builder as unknown as GroupingLayoutBuilder;
        if (definition.group) {
            builderWithGroup.group = definition.group;
        }
    }

    if (definition.node_size) {
        builder.nodeSize(definition.node_size);
    }

    if (definition.node_font_size) {
        builder.nodeFontSize(definition.node_font_size);
    }

    return builder.build();
}
