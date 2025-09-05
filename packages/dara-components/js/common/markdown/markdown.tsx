import type { Root } from 'hast';
import rehypeRaw from 'rehype-raw';
import type { PluggableList } from 'unified';
import { visit } from 'unist-util-visit';

import {
    type StyledComponentProps,
    type Variable,
    injectCss,
    prependBaseUrl,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
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
 * Rehype plugin that prepends the window.dara.base_url to all /static url attributes
 */
function prependBaseUrlToStaticUrls() {
    return (tree: Root) => {
        visit(tree, 'element', (node) => {
            if (!node.properties) {
                return;
            }

            // Attributes that may contain URLs
            const urlAttrs = ['src', 'href', 'data', 'srcset', 'action'];

            for (const attr of urlAttrs) {
                const value = node.properties[attr];
                if (typeof value === 'string') {
                    // Special case: srcset can contain multiple URLs
                    if (attr === 'srcset') {
                        node.properties[attr] = value
                            .split(',')
                            .map((part) => {
                                const [url, size] = part.trim().split(/\s+/, 2);
                                if (url) {
                                    return `${prependBaseUrl(url)}${size ? ` ${size}` : ''}`;
                                }
                                return part.trim();
                            })
                            .join(', ');
                    } else {
                        node.properties[attr] = prependBaseUrl(value);
                    }
                }
            }
        });
    };
}

/**
 * A component for rendering markdown
 */
function Markdown(props: MarkdownProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [markdown] = useVariable(props.markdown);

    const rehypePlugins: PluggableList = [];

    // raw must be before prependBaseUrlToStaticUrls, as we want
    // the prepended base url to be applied to the raw html as well
    if (props.html_raw) {
        rehypePlugins.push(rehypeRaw);
    }
    rehypePlugins.push(prependBaseUrlToStaticUrls);

    return (
        <CustomMarkdown
            id={props.id_}
            $rawCss={css}
            className={props.className}
            style={style}
            markdown={markdown}
            rehypePlugins={rehypePlugins}
        />
    );
}

export default Markdown;
