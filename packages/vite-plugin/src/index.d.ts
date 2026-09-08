import type { PluginOption } from "vite";

/** Additional files, directory inventories and environment values read by custom build plugins. */
export interface DaraOptions {
  inputs?: string[];
  directories?: string[];
  environment?: string[];
}

/** Configure the single Dara application pipeline, including React support. */
export default function dara(options?: DaraOptions): PluginOption[];
