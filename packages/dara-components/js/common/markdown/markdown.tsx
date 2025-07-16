import rehypeRaw from 'rehype-raw';

import { type StyledComponentProps, type Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import { Markdown as UiMarkdown } from '@darajs/ui-components';

interface MarkdownProps extends StyledComponentProps {
    /**
     * Whether to render raw HTML
     */
    html_raw?: boolean;
    /**
     * The markdown to render
     */
    markdown: Variable<string> | string;
}

const CustomMarkdown = injectCss(UiMarkdown);

/**
 * A component for rendering markdown
 */
function Markdown(props: MarkdownProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [markdown] = useVariable(props.markdown);

    const rehypePlugins = [];

    if (props.html_raw) {
        rehypePlugins.push(rehypeRaw);
    }

    return (
        <CustomMarkdown
            $rawCss={css}
            className={props.className}
            style={style}
            markdown={markdown}
            rehypePlugins={rehypePlugins}
        />
    );
}

export default Markdown;
