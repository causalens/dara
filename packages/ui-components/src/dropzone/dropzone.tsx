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
import { useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

import styled from '@darajs/styled-components';

const DROPZONE_ALLOWED_MIME_TYPES =
    '.csv, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, application/csv, text/x-csv, application/x-csv, text/comma-separated-values, text/x-comma-separated-values';

interface DropzoneProps {
    isDragActive: boolean;
}

const Dropzone = styled.div<DropzoneProps>`
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;

    margin-top: 20px;

    color: ${(props) => props.theme.colors.text};

    border: 1px dashed ${(props) => (props.isDragActive ? props.theme.colors.primary : props.theme.colors.grey3)};
    border-radius: 0.25rem;

    :hover {
        background-color: ${(props) => props.theme.colors.grey1};
    }

    :active,
    :focus {
        background-color: ${(props) => props.theme.colors.grey2};
    }
`;

const DropzoneMessage = styled.span`
    max-width: 400px;
    padding: 1.5rem;

    font-family: Manrope, sans-serif;
    font-weight: 300;
    text-align: center;
`;

export interface UploadDropzoneProps {
    /** optional comma-separated list of MIME-types of accepted files */
    accept?: string;
    /** Standard react className property */
    className?: string;
    /** Determines if the paste event listener should be enabled, allowing for direct pasting of text as files. */
    enablePaste?: boolean;
    /** An onDrop handler that is called when a file is dropped or selected from the */
    onDrop: (acceptedFiles: Array<File>) => void | Promise<void>;
    /** Styling property */
    style?: React.CSSProperties;
}

/**
 * This component renders a main Dropzone component based on the react-dropzone component. The component also adds a
 * global paste event listener to catch any paste events and converts that data into a file to be uploaded
 *
 * @param props accepts an onDrop handler that is called with an array of acceptedFiles.
 */
function UploadDropzone(props: UploadDropzoneProps): JSX.Element {
    useEffect(() => {
        if (!props.enablePaste) {
            return;
        }
        const handlePaste = (ev: ClipboardEvent): void => {
            const blob = new Blob([ev.clipboardData.getData('Text')], { type: 'text/plain' });
            const file = new File([blob], 'pasted_data', { type: 'text/plain' });
            props.onDrop([file]);
        };

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [props]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: props.accept ?? DROPZONE_ALLOWED_MIME_TYPES,
        multiple: false,
        onDrop: props.onDrop,
    });

    return (
        <Dropzone {...getRootProps()} className={props.className} isDragActive={isDragActive} style={props.style}>
            <input {...getInputProps()} />
            <DropzoneMessage>
                Drop your file, <br />
                paste it <br />
                or click here to upload
            </DropzoneMessage>
        </Dropzone>
    );
}

export default UploadDropzone;
