interface FormattedTextCellProps {
    value: any;
}

/**
 * A preformatted text cell that returns the value in a pre tag to keep it's original styling
 */
function FormattedTextCell(): (props: FormattedTextCellProps) => JSX.Element {
    function FormattedText({ value }: FormattedTextCellProps): JSX.Element {
        if (!value) {
            return <span />;
        }
        return <pre>{value}</pre>;
    }
    return FormattedText;
}

export default FormattedTextCell;
