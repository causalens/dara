interface LinkCellProps {
    row: any;
    value: any;
}

/**
 * The link cell pulls an associated href off the row and creates a link with the cell value as the text in the link
 */
function LinkCell(): (props: LinkCellProps) => JSX.Element {
    function Link({ row, value }: LinkCellProps): JSX.Element {
        if (!value) {
            return <span />;
        }
        return (
            <a
                className={row.original.clean ? 'report-clean-anchor' : row.original.className}
                href={row.original.href}
                id={row.original.name}
                rel="noopener noreferrer"
                target="_blank"
            >
                {value}
            </a>
        );
    }
    return Link;
}

export default LinkCell;
