/* eslint-disable no-await-in-loop */
import { describe, expect, it } from "vitest";

import fs from 'fs/promises';
import path from 'path';

import { denormalize, normalizeRequest } from '../../js/shared/utils/normalization';
import { readTemplateJson } from './utils/test-data-utils';

/**
 * These tests use serialised data as output by test_normalization.py
 */
describe('Normalization', () => {
    it('Denormalizes data correctly', async () => {
        const availableDataFolders = (
            await fs.readdir(path.join(__dirname, '../data/normalization'), { withFileTypes: true })
        )
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name);

        for (const dir of availableDataFolders) {
            const normalizedData = await readTemplateJson(
                path.join(__dirname, '../data/normalization', dir, 'normalized.json'),
                {}
            );
            const lookupData = await readTemplateJson(
                path.join(__dirname, '../data/normalization', dir, 'lookup.json'),
                {}
            );
            const denormalizedData = await readTemplateJson(
                path.join(__dirname, '../data/normalization', dir, 'denormalized.json'),
                {}
            );
            expect(denormalize(normalizedData, lookupData)).toMatchObject(denormalizedData);
        }
    });

    it('Normalizes request data correctly', async () => {
        const availableDataFolders = (
            await fs.readdir(path.join(__dirname, '../data/request_normalization'), { withFileTypes: true })
        )
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name)
            .filter((dirname) => dirname !== 'py_component_undefined_value');

        const templateData = {
            var_1_name: 'test_var_1',
            var_1_uid: 'test_uid_1',
            var_2_name: 'test_var_2',
            var_2_uid: 'test_uid_2',
            var_3_name: 'test_var_3',
            var_3_uid: 'test_uid_3',
        };

        for (const dir of availableDataFolders) {
            const normalizedData = await readTemplateJson(
                path.join(__dirname, '../data/request_normalization', dir, 'normalized.json'),
                templateData
            );
            const lookupData = await readTemplateJson(
                path.join(__dirname, '../data/request_normalization', dir, 'lookup.json'),
                templateData
            );
            const denormalizedData = await readTemplateJson(
                path.join(__dirname, '../data/request_normalization', dir, 'denormalized.json'),
                templateData
            );
            const defsData = await readTemplateJson(
                path.join(__dirname, '../data/request_normalization', dir, 'defs.json'),
                templateData
            );

            const normalized = normalizeRequest(denormalizedData, defsData);

            expect(normalized.data).toMatchObject(normalizedData);
            expect(normalized.lookup).toMatchObject(lookupData);
        }
    });

    it('Normalizes request data with with undefined values', async () => {
        const dir = 'py_component_undefined_value';

        const templateData = {
            var_1_name: 'test_var_1',
            var_1_uid: 'test_uid_1',
            var_2_name: 'test_var_2',
            var_2_uid: 'test_uid_2',
            var_3_name: 'test_var_3',
            var_3_uid: 'test_uid_3',
        };

        const normalizedData = await readTemplateJson(
            path.join(__dirname, '../data/request_normalization', dir, 'normalized.json'),
            templateData
        );
        const lookupData = await readTemplateJson(
            path.join(__dirname, '../data/request_normalization', dir, 'lookup.json'),
            templateData
        );
        const denormalizedData = {
            [templateData.var_1_name]: undefined,
            [templateData.var_2_name]: {
                force_key: null,
                type: 'derived',
                uid: templateData.var_2_uid,
                values: [1],
            },
        };

        const defsData = await readTemplateJson(
            path.join(__dirname, '../data/request_normalization', dir, 'defs.json'),
            templateData
        );

        const normalized = normalizeRequest(denormalizedData, defsData);

        expect(normalized.data).toMatchObject(normalizedData);
        expect(normalized.lookup).toMatchObject(lookupData);
    });
});
