# AGENTS.md - UI Components Package

## Commands
- **Build**: `pnpm run build` (TypeScript compilation)
- **Lint**: `pnpm run lint` (TypeScript check + ESLint + Stylelint)
- **Test**: `pnpm test` (Jest)
- **Test single file**: `pnpm test -- path/to/file.spec.tsx`
- **Test watch**: `pnpm run test-watch`
- **Format**: `pnpm run format` (Prettier)

## Code Style
- **Imports**: External libs first, then `@darajs/*`, then relative imports with blank lines between groups
- **Types**: Use `interface` for props, `type` for unions/aliases. Prefix styled component props with `$`
- **Components**: Use `forwardRef` for input-like components, set `displayName` for debugging
- **Styling**: Use `styled-components` from `@darajs/styled-components`, follow existing theme patterns
- **Props**: Extend standard HTML props, use `InteractiveComponentProps<T>` for form components
- **Naming**: PascalCase for components, camelCase for functions/variables, kebab-case for files
- **Error handling**: Use `errorMsg` prop pattern for validation errors
- **Comments**: JSDoc for public APIs, inline comments for complex logic only

## Testing
- Use `@testing-library/react` for component tests
- Test files: `*.spec.tsx` or `*.test.tsx`
- Setup file: `src/jest-setup.ts`
