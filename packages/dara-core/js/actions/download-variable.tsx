// /* eslint-disable react-hooks/rules-of-hooks */
// /* eslint-disable react-hooks/exhaustive-deps */

// import * as xl from 'exceljs';
// import { saveAs } from 'file-saver';
// import { useCallback } from 'react';

// import { useNotifications } from '@darajs/ui-notifications';
// import { Status } from '@darajs/ui-utils';

// import { useVariableValue } from '@/shared/interactivity';
// import { ActionHandler, DownloadVariableInstance } from '@/types/core';

// function isPromise(p: any): p is Promise<any> {
//     if (typeof p === 'object' && typeof p.then === 'function') {
//         return true;
//     }
//     return false;
// }

// const createMatrixFromArrayOfObjects = (content: Array<Record<string, any>>): any[][] => {
//     const headings: string[] = [];
//     const indexes: Record<string, number> = {};
//     content.forEach((c) => {
//         Object.keys(c).forEach((k) => {
//             if (!headings.includes(k)) {
//                 headings.push(k);
//                 indexes[k] = headings.length - 1;
//             }
//         });
//     });

//     const headingsLength = headings.length;

//     const matrix: any[][] = [];

//     content.forEach((c) => {
//         const row: any[] = new Array(headingsLength);
//         Object.entries(c).forEach(([k, v]) => {
//             row[indexes[k]] = v;
//         });

//         matrix.push(row);
//     });

//     matrix.unshift(headings);

//     return matrix;
// };

// /**
//  * Process a cell value - convert it to a string and wrap in quotes if required
//  */
// const processCell = (cell: any): string => {
//     let cellValue = cell === null ? '' : String(cell);

//     // Wrap the cell in quotes if it has a quote itself, a comma or a newline (outside of the 0 index)
//     if (cellValue.search(/("|,|\n)/g) > 0) {
//         cellValue = `"${cellValue}"`;
//     }

//     return cellValue;
// };

// const createCsvFromMatrix = (matrix: any[][]): Blob => {
//     const csv = matrix.map((col) => col.map((cell) => processCell(cell)).join(',')).join('\n');
//     const blob = new Blob([csv], { type: 'text/csv' });
//     return blob;
// };

// const createJsonBlob = (jso: any): Blob => {
//     const json = JSON.stringify(jso, null, 2);
//     return new Blob([json], { type: 'application/json' });
// };

// const createXLFromMatrix = async (name: string, matrix: any[][]): Promise<Blob> => {
//     const wb = new xl.Workbook();

//     const ws = wb.addWorksheet(name);

//     const columns = matrix[0].map((h) => ({
//         filterButton: true,
//         name: h,
//     }));

//     const rows = [...matrix];
//     rows.shift();

//     ws.addTable({
//         columns,
//         headerRow: true,
//         name: 'DataTable',
//         ref: 'B2',
//         rows,
//         style: {
//             showRowStripes: true,
//             theme: 'TableStyleMedium2',
//         },
//         totalsRow: false,
//     });

//     const buff = await wb.xlsx.writeBuffer();

//     const blob = new Blob([buff], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

//     return blob;
// };

// const createMatrixFromValue = (val: Array<Record<string, any>> | any[][]): any[][] => {
//     let isMatrix = false;
//     let isArrayOfObjects = false;

//     if (Array.isArray(val) && val.length > 0) {
//         const first = val[0];
//         if (Array.isArray(first)) {
//             isMatrix = true;
//         }
//         if (typeof val === 'object') {
//             isArrayOfObjects = true;
//         }
//     }

//     if (isArrayOfObjects) {
//         return createMatrixFromArrayOfObjects(val);
//     }

//     if (isMatrix) {
//         return val as any[][];
//     }

//     return undefined;
// };

// /**
//  * Frontend handler for DownloadVariable action
//  * Retrieves the variable value and downloads the variable as either a csv or xl file
//  */
// const DownloadVariable: ActionHandler<any, DownloadVariableInstance> = (action) => {
//     const valResolver = useVariableValue(action.variable, true);
//     const { pushNotification } = useNotifications();

//     return useCallback(async (): Promise<void> => {
//         const valOrPromise = valResolver();
//         const val = isPromise(valOrPromise) ? await valOrPromise : valOrPromise;

//         // strip the __index__ column from data vars
//         if (action.variable.__typename === 'DataVariable' || action.variable.__typename === 'DerivedDataVariable') {
//             for (const row of val) {
//                 if ('__index__' in row) {
//                     delete row.__index__;
//                 }
//             }
//         }

//         const fileName = action.file_name || 'Data';
//         const fileNameWithExt = `${fileName}.${action.type}`;

//         if (action.type === 'json') {
//             const blob = createJsonBlob(val);
//             saveAs(blob, fileNameWithExt);
//             return Promise.resolve();
//         }

//         const matrix = createMatrixFromValue(val);

//         if (!matrix) {
//             pushNotification({
//                 key: action.uid,
//                 message: 'Try again or contact the application owner',
//                 status: Status.ERROR,
//                 title: 'Error downloading file',
//             });
//             return Promise.resolve();
//         }

//         const notExcel = !action.type || action.type !== 'xlsx';
//         const blob = notExcel ? createCsvFromMatrix(matrix) : await createXLFromMatrix(fileName, matrix);

//         saveAs(blob, fileNameWithExt);

//         return Promise.resolve();
//     }, [action]);
// };

// export default DownloadVariable;
