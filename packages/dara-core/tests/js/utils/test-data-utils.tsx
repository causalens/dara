/* eslint-disable import/prefer-default-export */
import fs from 'fs/promises';

export async function readTemplateJson(path: string, data: Record<string, string>): Promise<any> {
    let dataAsString = await fs.readFile(path, {
        encoding: 'utf-8',
    });

    for (const [key, val] of Object.entries(data)) {
        dataAsString = dataAsString.replace(new RegExp(`{{${key}}}`, 'g'), val);
    }

    return JSON.parse(dataAsString);
}
