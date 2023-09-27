import round from 'lodash/round';

interface NumberCellProps {
    value: any;
}

/**
 * A number formatting cell, returns a string of the value at the given numerical precision
 *
 * @param precision the desired precision to render the value with
 */
function NumberCell(precision = 2): (props: NumberCellProps) => string {
    return ({ value }: NumberCellProps): string => {
        if (Number.isNaN(Number(value))) {
            return value ?? null;
        }

        return String(round(value, precision).toFixed(precision));
    };
}

export default NumberCell;
