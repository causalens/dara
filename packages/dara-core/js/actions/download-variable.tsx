import * as xl from 'exceljs';
import { saveAs } from 'file-saver';

import { Status } from '@darajs/ui-utils';

import { getTabularVariableValue } from '@/shared';
import { type ActionHandler, type DataFrame, type DownloadVariableImpl } from '@/types/core';

/**
 * Restore original column names by inverting pandas_utils transformations
 */
export const restoreColumnName = (colName: string): string => {
    // Handle __col__N__originalName format
    const colMatch = colName.match(/^__col__\d+__(.+)$/);
    if (colMatch) {
        return colMatch[1]!;
    }

    // Handle __index__N__originalName format (keep as is for index columns)
    if (colName.startsWith('__index__')) {
        return colName;
    }

    return colName;
};

/**
 * Process data to restore original column structure before creating matrix
 */
export const processDataForDownload = (content: DataFrame): DataFrame => {
    return content.map((row) => {
        const processedRow: Record<string, any> = {};

        Object.entries(row).forEach(([key, value]) => {
            // Skip __index__ columns entirely for downloads
            if (key === '__index__' || key.startsWith('__index__')) {
                return;
            }

            const restoredKey = restoreColumnName(key);
            processedRow[restoredKey] = value;
        });

        return processedRow;
    });
};

const createMatrixFromArrayOfObjects = (content: Array<Record<string, any>>): any[][] => {
    // Process the data to restore original column names and remove index columns
    const processedContent = processDataForDownload(content);

    const headings: string[] = [];
    const indexes: Record<string, number> = {};
    processedContent.forEach((c) => {
        Object.keys(c).forEach((k) => {
            if (!headings.includes(k)) {
                headings.push(k);
                indexes[k] = headings.length - 1;
            }
        });
    });

    const headingsLength = headings.length;

    const matrix: any[][] = [];

    processedContent.forEach((c) => {
        const row: any[] = new Array(headingsLength);
        Object.entries(c).forEach(([k, v]) => {
            row[indexes[k]!] = v;
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

    const columns = matrix[0]!.map((h) => ({
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

const createMatrixFromValue = (val: Array<Record<string, any>> | any[][]): any[][] | null => {
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

    return null;
};

/**
 * Frontend handler for DownloadVariable action
 * Retrieves the variable value and downloads the variable as either a csv, json or xl file
 */
const DownloadVariable: ActionHandler<DownloadVariableImpl> = async (ctx, actionImpl): Promise<void> => {
    let value = await getTabularVariableValue(actionImpl.variable, {
        client: ctx.wsClient,
        extras: ctx.extras,
        search: ctx.location.search,
        snapshot: ctx.snapshot,
        taskContext: ctx.taskCtx,
    });

    if (value === null) {
        ctx.notificationCtx.pushNotification({
            key: '_downloadVariable',
            message: 'Failed to fetch the variable value',
            status: Status.ERROR,
            title: 'Error fetching variable value',
        });
        return;
    }

    // Process data to restore original column structure and remove internal columns if it's in tabular format
    // this simply cleans keys in [{record1}, {record2}] format
    if (Array.isArray(value)) {
        value = processDataForDownload(value);
    }

    const fileName = actionImpl.file_name || 'Data';
    const fileNameWithExt = `${fileName}.${actionImpl.type}`;
    if (actionImpl.type === 'json') {
        const blob = createJsonBlob(value);
        saveAs(blob, fileNameWithExt);
        return Promise.resolve();
    }
    const matrix = createMatrixFromValue(value);
    if (matrix === null) {
        throw new Error('Unable to create matrix from value');
    }
    const notExcel = !actionImpl.type || actionImpl.type !== 'xlsx';
    const blob = notExcel ? createCsvFromMatrix(matrix) : await createXLFromMatrix(fileName, matrix);
    saveAs(blob, fileNameWithExt);
};

export default DownloadVariable;
