import ReactMarkdown, { Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styled from '@darajs/styled-components';

interface MarkdownProps extends Options {
    /**
     * The markdown string to render
     */
    markdown: string;
    /** Pass through of className property */
    className?: string;
    /** Native react style property, can be used to fine tune the element appearance */
    style?: React.CSSProperties;
}

const CustomMarkdownWrapper = styled.div`
    /*
     * Apply some base styles to the markdown content so it looks good by default
     * Inspired by https://tailwindcss.com/docs/typography-plugin
    */
    code {
        font-size: 0.9rem;
    }

    p {
        margin-top: 1.25rem;
        margin-bottom: 1.25rem;
        line-height: 1.5rem;

        code {
            padding: 0.1rem;
            background-color: ${(props) => props.theme.colors.grey1};
            border: 1px solid ${(props) => props.theme.colors.grey3};
            border-radius: 0.25rem;
        }
    }

    p,
    tr {
        math {
            padding: 0;
            font-size: 1.25rem;
        }
    }

    /* stylelint-disable-next-line */
    math {
        padding: 0.5rem;
        font-size: 1.5rem;
    }

    a {
        color: ${(props) => props.theme.colors.primary};
        word-break: break-word;
    }

    blockquote {
        /* stylelint-disable-next-line */
        quotes: '"\\201C""\\201D""\\2018""\\2019"';

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
        font-weight: 800;
        line-height: 1.1;
    }

    h2 {
        margin-top: 1rem;
        margin-bottom: 1rem;

        font-size: 2rem;
        font-weight: 800;
        line-height: 1.3;
    }

    h3 {
        margin-top: 1.6rem;
        margin-bottom: 0.6rem;

        font-size: 1.25rem;
        font-weight: 800;
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
        padding: 0 0.5em;

        font-size: 0.9rem;
        line-height: 1.7;

        background-color: ${(props) => props.theme.colors.blue2};
        border: 1px solid ${(props) => props.theme.colors.blue3};
        border-radius: 0.375rem;

        div {
            background-color: ${(props) => props.theme.colors.blue2} !important;

            span {
                background-color: ${(props) => props.theme.colors.blue2};
            }
        }
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
            line-height: 1.5rem;

            code {
                padding: 0.1em;
                background-color: ${(props) => props.theme.colors.grey1};
                border: 1px solid ${(props) => props.theme.colors.grey3};
                border-radius: 0.25rem;
            }

            strong {
                font-style: italic;
            }

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

    hr {
        margin-top: 3rem;
        margin-bottom: 3rem;
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

    /* Remove top margin for first-child */
    h1:first-child,
    h2:first-child,
    h3:first-child,
    h4:first-child,
    blockquote:first-child,
    ol:first-child,
    ul:first-child,
    li:first-child,
    p:first-child,
    img:first-child,
    figure:first-child,
    video:first-child,
    pre:first-child,
    hr:first-child {
        margin-top: 0;
    }

    /* Remove bottom margin for last-child */
    h1:last-child,
    h2:last-child,
    h3:last-child,
    h4:last-child,
    blockquote:last-child,
    ol:last-child,
    ul:last-child,
    li:last-child,
    p:last-child,
    img:last-child,
    figure:last-child,
    video:last-child,
    pre:last-child,
    hr:last-child {
        margin-bottom: 0;
    }
`;

/**
 * A component for rendering markdown
 */
function Markdown(props: MarkdownProps): JSX.Element {
    const { markdown, className, style, ...reactMarkdownProps } = props;

    return (
        <CustomMarkdownWrapper className={className} style={style}>
            <ReactMarkdown {...reactMarkdownProps} remarkPlugins={reactMarkdownProps.remarkPlugins ?? [remarkGfm]}>
                {markdown}
            </ReactMarkdown>
        </CustomMarkdownWrapper>
    );
}

export default Markdown;
