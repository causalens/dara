import { useState } from 'react';

import {
    Action,
    Center,
    DataVariable,
    DefaultFallback,
    RequestExtras,
    StyledComponentProps,
    handleAuthErrors,
    injectCss,
    request,
    useAction,
    useComponentStyles,
    useRequestExtras,
} from '@darajs/core';
import styled, { useTheme } from '@darajs/styled-components';
import { Button, UploadDropzone as UIUploadDropzone } from '@darajs/ui-components';
import { Check } from '@darajs/ui-icons';
import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

const status = {
    FAILED: 'FAILED',
    INITIALIZED: 'INITIALIZED',
    LOADING: 'LOADING',
    SUCCESS: 'SUCCESS',
};

const StyledCheck = styled(Check)`
    color: ${(props) => props.theme.colors.success};
`;

const Heading = styled.h2`
    margin-bottom: 1rem;
    color: ${(props) => props.theme.colors.text};
`;

async function uploadFileToExtension(
    file: File,
    extras: RequestExtras,
    variableId?: string,
    resolver_id?: string
): Promise<{ newStatus: string }> {
    const formData = new FormData();
    formData.append('data', file);

    if (resolver_id) {
        formData.append('resolver_id', resolver_id);
    }

    const url = new URL('/api/core/data/upload', window.location.origin);

    if (variableId) {
        url.searchParams.set('data_uid', variableId);
    }

    const res = await request(
        url,
        {
            body: formData,
            method: HTTP_METHOD.POST,
        },
        extras
    );
    await handleAuthErrors(res, true);
    await validateResponse(res, `Failed to upload file: ${file.name}`);
    const result: { [k: string]: any } = await res.json();
    return { newStatus: result.status };
}

interface DropzoneProps extends StyledComponentProps {
    /** Optional comma-separated list of accepted MIME-types */
    accept?: string;
    /** Determines if the paste event listener should be enabled, allowing for direct pasting of text as files. */
    enable_paste?: boolean;
    /** the action to trigger when a file is successfully uploaded */
    on_drop?: Action;
    /** optional resolver to use for the data */
    resolver_id?: string;
    /** variable to store data in */
    target?: DataVariable;
}

const StyledDropzone = injectCss(UIUploadDropzone);
const StyledCenter = injectCss(Center);

/**
 * A wrapper around the UploadDropzone component that enables files to upload to the data extension. When a file is
 * successfully uploaded it will update the name variable and trigger the onUpload action.
 * @param {DropzoneProps} props - the component props
 */
function UploadDropzone(props: DropzoneProps): JSX.Element {
    const theme = useTheme();
    const [style, css] = useComponentStyles(props);
    const [currentStatus, setCurrentStatus] = useState(status.INITIALIZED);
    const [errorMessage, setErrorMessage] = useState<string>();
    const [onFileDrop] = useAction(props.on_drop);
    const extras = useRequestExtras();

    const onDrop = async (acceptedFiles: Array<File>): Promise<void> => {
        if (acceptedFiles.length === 1) {
            setCurrentStatus(status.LOADING);

            try {
                const { newStatus } = await uploadFileToExtension(
                    acceptedFiles[0],
                    extras,
                    props.target?.uid,
                    props.resolver_id
                );
                setCurrentStatus(newStatus);
            } catch (err) {
                setErrorMessage(err.message);
                setCurrentStatus(status.FAILED);
                throw err;
            }
            onFileDrop(acceptedFiles[0]);
        } else {
            setErrorMessage('Upload failed. Please individually drop CSV files');
            setCurrentStatus(status.FAILED);
        }
    };

    const onReset = (): void => {
        setCurrentStatus(status.INITIALIZED);
        setErrorMessage(undefined);
    };

    if (currentStatus === status.SUCCESS) {
        return (
            <StyledCenter $rawCss={css} style={style}>
                <StyledCheck size="10x" />
                <Heading>Upload Successful</Heading>
                <Button onClick={onReset} styling="secondary">
                    Upload Again
                </Button>
            </StyledCenter>
        );
    }
    if (currentStatus === status.FAILED) {
        return (
            <StyledCenter $rawCss={css} style={style}>
                <span style={{ color: theme.colors.error, textAlign: 'center' }}>{errorMessage}</span>
                <Heading>Upload Failed</Heading>
                <Button onClick={onReset} styling="ghost">
                    Upload Again
                </Button>
            </StyledCenter>
        );
    }
    if (currentStatus === status.LOADING) {
        return <DefaultFallback />;
    }
    return (
        <StyledDropzone
            $rawCss={css}
            accept={props.accept}
            enablePaste={props.enable_paste}
            onDrop={onDrop}
            style={style}
        />
    );
}

export default UploadDropzone;
