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
import { Meta } from '@storybook/react';
import { useState } from 'react';

import { default as DropzoneComponent, UploadDropzoneProps } from './dropzone';

export default {
    component: DropzoneComponent,
    title: 'UI Components/Dropzone',
} as Meta;

export const Dropzone = (props: UploadDropzoneProps): JSX.Element => {
    const [files, setFiles] = useState<string[]>([]);

    const handleDrop = (acceptedFiles: Array<File>): void => {
        setFiles(acceptedFiles.map(f => f.name));
    };

    return (
        <div>
            <DropzoneComponent {...props} onDrop={handleDrop} />
            {files.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#e8f5e8' }}>
                    <strong>Files accepted:</strong>
                    <ul>
                        {files.map((file, i) => (
                            <li key={i}>{file}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
