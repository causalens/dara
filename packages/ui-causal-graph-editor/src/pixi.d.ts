/* eslint-disable import/no-extraneous-dependencies */
import type * as PixiFilters from 'pixi-filters';
import * as PixiViewport from 'pixi-viewport';
import type * as PIXILib from 'pixi.js';

declare global {
    const PIXI: typeof PIXILib & {
        filters: typeof PixiFilters;
    };

    namespace PIXI {
        export type Application = PIXILib.Application;
        export type CanvasTextMetrics = PIXILib.CanvasTextMetrics;
        export type Circle = PIXILib.Circle;
        export type Color = PIXILib.Color;
        export type Container<C extends PIXILib.ContainerChild = PIXILib.ContainerChild> = PIXILib.Container<C>;
        export type CullerPlugin = PIXILib.CullerPlugin;
        export type FederatedMouseEvent = PIXILib.FederatedMouseEvent;
        export type Filter = PIXILib.Filter;
        export type Graphics = PIXILib.Graphics;
        export type MSAA_QUALITY = PIXILib.MSAA_QUALITY;
        export type Point = PIXILib.Point;
        export type PointData = PIXILib.PointData;
        export type Polygon = PIXILib.Polygon;
        export type Rectangle = PIXILib.Rectangle;
        export type Renderer = PIXILib.Renderer;
        export type RendererType = PIXILib.RendererType;
        export type Sprite = PIXILib.Sprite;
        export type Text = PIXILib.Text;
        export type TextStyle = PIXILib.TextStyle;
        export type Texture = PIXILib.Texture;
        export type TilingSprite = PIXILib.TilingSprite;
        export type WebGLRenderer = PIXILib.WebGLRenderer;

        export namespace filters {
            export type DropShadowFilter = PixiFilters.DropShadowFilter;
        }
    }
    namespace pixi_viewport {
        export = PixiViewport;
    }
    interface Window {
        PIXI?: typeof PIXI;
        pixi_js: typeof PIXI;
        pixi_viewport?: typeof pixi_viewport;
        pixiLoadPromise?: Promise<void>;
        pixiLoading?: boolean;
    }
}

export {};
