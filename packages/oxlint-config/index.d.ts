import type { OxlintConfig } from 'oxlint';

declare const config: OxlintConfig;

/**
 * Optional rules for projects that use React and JSX.
 */
export declare const reactConfig: OxlintConfig;

/**
 * Optional rules for projects that use Vitest.
 */
export declare const vitestConfig: OxlintConfig;

/**
 * Root-only options that enable Oxlint's tsgo-backed rules and TypeScript
 * compiler diagnostics.
 */
export declare const typeAwareOptions: Readonly<NonNullable<OxlintConfig['options']>>;

export default config;
