/* eslint-disable import/no-extraneous-dependencies */
import * as PixiFilters from 'pixi-filters';
import * as PixiViewport from 'pixi-viewport';
import * as PIXILib from 'pixi.js';

declare global {
    namespace PIXI {
        export = PIXILib;

        export namespace filters {
            export = PixiFilters;
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
