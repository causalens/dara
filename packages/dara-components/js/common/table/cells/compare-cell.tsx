import styled from '@darajs/styled-components';

interface CompareCellProps {
    value: any;
}

const CondtionOptions = {
    EQUAL: 'equal',
};

interface CompareSpanProps {
    target: any;
    value: any;
}

const ComparisonSpan = styled.span<CompareSpanProps>`
    color: ${(props) => (props.value === props.target ? props.theme.colors.success : props.theme.colors.error)};
`;

/**
 * A comparison formatting cell. Returns a green colored span if the value pass the condition relative to the target,
 * else returns a red colored span.
 *
 * @param condition - the conditional statement to apply
 * @param target - the name of the column to compare against
 */
function CompareCell(condition: string, target: string): (props: CompareCellProps) => JSX.Element {
    function FormattedCell(props: any): JSX.Element {
        // If number check for NaN
        if (typeof props.value === 'number' && Number.isNaN(props.value)) {
            return props.value;
        }
        // If not a number, check defined -- avoids exluding zeros
        if (typeof props.value !== 'number' && !props.value) {
            return <span />;
        }
        if (condition === CondtionOptions.EQUAL) {
            return (
                <ComparisonSpan target={props.row.original[target]} value={props.value}>
                    {props.value}
                </ComparisonSpan>
            );
        }
        return <span>{props.value}</span>;
    }
    return FormattedCell;
}

export default CompareCell;
