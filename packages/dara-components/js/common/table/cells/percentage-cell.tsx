import round from 'lodash/round';

interface PercentageCellProps {
    value: any;
}

/**
 * A percentage formatting cell, returns an adaptive precision value string with percentage sign attached
 *
 * @param precision the precision to format the percentage too
 */
function PercentageCell(precision = 1): (props: PercentageCellProps) => string {
    return ({ value }: PercentageCellProps): string => {
        if (Number.isNaN(Number(value))) {
            return value;
        }
        return `${round(100 * value, precision).toFixed(precision)}%`;
    };
}

export default PercentageCell;
