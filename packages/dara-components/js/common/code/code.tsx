import { Language } from 'prism-react-renderer';

import { StyledComponentProps, Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';
import { CodeComponentThemes, CodeViewer as UiCodeViewer } from '@darajs/ui-components';

const StyledCodeViewer = injectCss(styled(UiCodeViewer));

interface CodeProps extends StyledComponentProps {
    className: string;
    code: string | Variable<string>;
    language: Language;
    theme?: CodeComponentThemes;
}

function Code(props: CodeProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [code] = useVariable(props.code);

    return (
        <StyledCodeViewer
            $rawCss={css}
            className={props.className}
            code={code}
            codeTheme={props.theme}
            language={props.language}
            style={{
                ...style,
            }}
        />
    );
}

export default Code;
