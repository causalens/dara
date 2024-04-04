import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { StyledComponentProps, Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import styled from '@darajs/styled-components';

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

const _CustomMarkdown = styled.div`
    /*
     * Apply some base styles to the markdown content so it looks good by default
     * Inspired by https://tailwindcss.com/docs/typography-plugin
    */
    p {
        margin-top: 1.25rem;
        margin-bottom: 1.25rem;
    }

    blockquote {
        /* stylelint-disable declaration-property-value-no-unknown */
        quotes: '"\\201C""\\201D""\\2018""\\2019"';
        /* stylelint-enable declaration-property-value-no-unknown */

        margin-top: 1.5rem;
        margin-bottom: 1.5rem;
        padding-left: 1rem;

        font-weight: 500;
        font-style: italic;
        color: ${(props) => props.theme.colors.grey6};

        border-left: 0.25rem solid ${(props) => props.theme.colors.grey3};
    }

    h1 {
        margin-top: 2rem;
        margin-bottom: 1rem;
        font-size: 2.5rem;
        line-height: 1.1;
    }

    h2 {
        margin-top: 2rem;
        margin-bottom: 1rem;
        font-size: 1.5rem;
        line-height: 1.3;
    }

    h3 {
        margin-top: 1.6rem;
        margin-bottom: 0.6rem;
        font-size: 1.25rem;
        line-height: 1.25;
    }

    h4 {
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
        line-height: 1.5;
    }

    img,
    figure,
    video {
        margin-top: 1.5rem;
        margin-bottom: 1.5rem;

        * {
            margin-top: 0;
            margin-bottom: 0;
        }
    }

    code {
        font-size: 0.9rem;
    }

    h2 code {
        font-size: 0.875rem;
    }

    h3 code {
        font-size: 0.9rem;
    }

    pre {
        overflow-x: auto;

        margin-top: 1.7rem;
        margin-bottom: 1.7rem;
        padding: 0.85rem 1.15rem;

        font-size: 0.9rem;
        line-height: 1.7;

        border-radius: 0.375rem;
    }

    hr {
        margin-top: 3rem;
        margin-bottom: 3rem;
    }

    hr + *,
    h2 + *,
    h3 + *,
    h4 + * {
        margin-top: 0;
    }

    ol,
    ul {
        margin-top: 1.25rem;
        margin-bottom: 1.25rem;
        padding-left: 1.625rem;

        li {
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
            padding-left: 0.375rem;

            p {
                margin-top: 0.75rem;
                margin-bottom: 0.75rem;
            }

            *:first-child {
                margin-top: 1.25rem;
            }

            *:last-child {
                margin-bottom: 1.25rem;
            }
        }
    }

    table {
        font-size: 0.875rem;
        line-height: 1.7;

        thead {
            th {
                padding-right: 0.5rem;
                padding-bottom: 0.5rem;
                padding-left: 0.5rem;
            }

            th:first-child {
                padding-left: 0;
            }

            th:last-child {
                padding-right: 0;
            }
        }

        tbody {
            td {
                padding: 0.5rem;
            }

            td:first-child {
                padding-left: 0;
            }

            td:last-child {
                padding-right: 0;
            }
        }
    }
`;
const CustomMarkdown = injectCss(_CustomMarkdown);

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
        <CustomMarkdown $rawCss={css} className={props.className} style={style}>
            <ReactMarkdown rehypePlugins={rehypePlugins} remarkPlugins={[remarkGfm]}>
                {markdown}
            </ReactMarkdown>
        </CustomMarkdown>
    );
}

export default Markdown;
