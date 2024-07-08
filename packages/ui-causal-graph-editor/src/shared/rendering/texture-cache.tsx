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
import { SCALE_MODES } from '@pixi/constants';
import { IRenderer, Texture } from '@pixi/core';
import { Container } from '@pixi/display';
import { Rectangle } from '@pixi/math';

/**
 * Utility cache to create and store textures
 */
export class TextureCache {
    renderer: IRenderer;

    private textures = new Map<string, Texture>();

    constructor(renderer: IRenderer) {
        this.renderer = renderer;
    }

    /**
     * Get a texture for a given cache key or create a default one
     *
     * @param key unique key to identify the texture
     * @param defaultCallback callback to create a new texture if one doesn't exist
     */
    get(key: string, defaultCallback: () => Container, padding = 0): Texture {
        let texture = this.textures.get(key);
        if (!texture) {
            const container = defaultCallback();
            const region = container.getLocalBounds(undefined, true);
            const roundedRegion = new Rectangle(
                Math.floor(region.x) - padding / 2,
                Math.floor(region.y) - padding / 2,
                Math.ceil(region.width) + padding,
                Math.ceil(region.height) + padding
            );
            texture = this.renderer.generateTexture(container, {
                region: roundedRegion,
                resolution: this.renderer.resolution * 2,
                scaleMode: SCALE_MODES.LINEAR,
            });
            this.textures.set(key, texture);
        }
        return texture;
    }

    /**
     * Delete texture for given cache key
     *
     * @param key cache key to delete texture for
     */
    delete(key: string): void {
        const texture = this.textures.get(key);
        if (!texture) {
            return;
        }

        texture.destroy();
        this.textures.delete(key);
    }

    /**
     * Clear out all stored textures
     */
    clear(): void {
        Array.from(this.textures.keys()).forEach((key) => {
            this.delete(key);
        });
    }

    /**
     * Destroy the texture cache
     */
    destroy(): void {
        this.clear();
    }
}
