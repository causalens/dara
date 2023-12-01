import * as xl from 'exceljs';
import { saveAs } from 'file-saver';

import { getVariableValue } from '@/shared/interactivity/use-variable-value';
import { ActionHandler, DownloadVariableImpl } from '@/types/core';

const createMatrixFromArrayOfObjects = (content: Array<Record<string, any>>): any[][] => {
    const headings: string[] = [];
    const indexes: Record<string, number> = {};
    content.forEach((c) => {
        Object.keys(c).forEach((k) => {
            if (!headings.includes(k)) {
                headings.push(k);
                indexes[k] = headings.length - 1;
            }
        });
    });

    const headingsLength = headings.length;

    const matrix: any[][] = [];

    content.forEach((c) => {
        const row: any[] = new Array(headingsLength);
        Object.entries(c).forEach(([k, v]) => {
            row[indexes[k]] = v;
        });

        matrix.push(row);
    });

    matrix.unshift(headings);

    return matrix;
};

/**
 * Process a cell value - convert it to a string and wrap in quotes if required
 */
const processCell = (cell: any): string => {
    let cellValue = cell === null ? '' : String(cell);

    // Wrap the cell in quotes if it has a quote itself, a comma or a newline (outside of the 0 index)
    if (cellValue.search(/("|,|\n)/g) > 0) {
        cellValue = `"${cellValue}"`;
    }

    return cellValue;
};

const createCsvFromMatrix = (matrix: any[][]): Blob => {
    const csv = matrix.map((col) => col.map((cell) => processCell(cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    return blob;
};

const createJsonBlob = (jso: any): Blob => {
    const json = JSON.stringify(jso, null, 2);
    return new Blob([json], { type: 'application/json' });
};

const createXLFromMatrix = async (name: string, matrix: any[][]): Promise<Blob> => {
    const wb = new xl.Workbook();

    const ws = wb.addWorksheet(name);

    const columns = matrix[0].map((h) => ({
        filterButton: true,
        name: h,
    }));

    const rows = [...matrix];
    rows.shift();

    ws.addTable({
        columns,
        headerRow: true,
        name: 'DataTable',
        ref: 'B2',
        rows,
        style: {
            showRowStripes: true,
            theme: 'TableStyleMedium2',
        },
        totalsRow: false,
    });

    const buff = await wb.xlsx.writeBuffer();

    const blob = new Blob([buff], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    return blob;
};

const createMatrixFromValue = (val: Array<Record<string, any>> | any[][]): any[][] => {
    let isMatrix = false;
    let isArrayOfObjects = false;

    if (Array.isArray(val) && val.length > 0) {
        const first = val[0];
        if (Array.isArray(first)) {
            isMatrix = true;
        }
        if (typeof val === 'object') {
            isArrayOfObjects = true;
        }
    }

    if (isArrayOfObjects) {
        return createMatrixFromArrayOfObjects(val);
    }

    if (isMatrix) {
        return val as any[][];
    }

    return undefined;
};

/**
 * Frontend handler for DownloadVariable action
 * Retrieves the variable value and downloads the variable as either a csv, json or xl file
 */
const DownloadVariable: ActionHandler<DownloadVariableImpl> = async (ctx, actionImpl): Promise<void> => {
    let value = getVariableValue(actionImpl.variable, true, {
        client: ctx.wsClient,
        extras: ctx.extras,
        search: ctx.location.search,
        snapshot: ctx.snapshot,
        taskContext: ctx.taskCtx,
    });

    if (value instanceof Promise) {
        value = await value;
    }

    // strip the __index__ column from data vars
    if (actionImpl.variable.__typename === 'DataVariable' || actionImpl.variable.__typename === 'DerivedDataVariable') {
        for (const row of value) {
            if ('__index__' in row) {
                delete row.__index__;
            }
        }
    }

    const fileName = actionImpl.file_name || 'Data';
    const fileNameWithExt = `${fileName}.${actionImpl.type}`;
    if (actionImpl.type === 'json') {
        const blob = createJsonBlob(value);
        saveAs(blob, fileNameWithExt);
        return Promise.resolve();
    }
    const matrix = createMatrixFromValue(value);
    if (!matrix) {
        throw new Error('Unable to create matrix from value');
    }
    const notExcel = !actionImpl.type || actionImpl.type !== 'xlsx';
    const blob = notExcel ? createCsvFromMatrix(matrix) : await createXLFromMatrix(fileName, matrix);
    saveAs(blob, fileNameWithExt);
};

export default DownloadVariable;
