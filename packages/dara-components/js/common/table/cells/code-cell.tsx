import Highlight, { Language, defaultProps } from 'prism-react-renderer';

interface CodeCellProps {
    value: any;
}

/**
 * The code cell displays the cell contents as highlighted code
 *
 * @param language the language to format for
 */
function CodeCell(language: Language): (props: CodeCellProps) => JSX.Element {
    function Code({ value }: CodeCellProps): JSX.Element {
        if (!value) {
            return <span />;
        }
        return (
            <Highlight {...defaultProps} code={value} language={language}>
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                    <pre className={className} style={style}>
                        {tokens.map((line, i) => (
                            <div {...getLineProps({ key: i, line })} key={i}>
                                {line.map((token, key) => (
                                    <span {...getTokenProps({ key, token })} key={key} />
                                ))}
                            </div>
                        ))}
                    </pre>
                )}
            </Highlight>
        );
    }
    return Code;
}

export default CodeCell;
