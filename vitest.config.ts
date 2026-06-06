import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        pool: 'forks',
        include: ['tests/**/*.test.ts'],
        exclude: ['dist/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: [],
            reportOnFailure: true,
            thresholds: {
                statements: 99,
                branches: 97,
                functions: 100,
                lines: 100,
                autoUpdate: (newThreshold) => Math.floor(newThreshold),
            },
        },
    },
});
