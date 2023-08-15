import * as React from 'react';

interface LocalJsComponentProps {
    content?: string;
}

function LocalJsComponent(props: LocalJsComponentProps) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
            }}
        >
            <div>
                This is a local component that is registered and loaded via the configuration directly from within the
                test application
            </div>
            <div>Passed Content: {props.content}</div>
        </div>
    );
}

export default LocalJsComponent;
