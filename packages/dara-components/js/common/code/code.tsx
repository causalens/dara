import { type Language } from 'prism-react-renderer';

import { type StyledComponentProps, type Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import { CodeComponentThemes, CodeViewer as UiCodeViewer } from '@darajs/ui-components';

const StyledCodeViewer = injectCss(UiCodeViewer);

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
            id={props.id_}
            $rawCss={css}
            className={props.className}
            value={code}
            codeTheme={props.theme}
            language={props.language}
            style={{
                ...style,
            }}
        />
    );
}

export default Code;
