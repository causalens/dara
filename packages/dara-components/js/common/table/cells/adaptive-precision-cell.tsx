import round from 'lodash/round';

interface AdaptivePrecisionCellProps {
    value: any;
}

/**
 * An adaptive precision formatting cell, returns a string of the value with a pre-defined precision.
 */
function AdaptivePrecisionCell(): (props: AdaptivePrecisionCellProps) => string {
    return ({ value }: AdaptivePrecisionCellProps): string => {
        if (Number.isNaN(Number(value))) {
            return value;
        }
        const abs_value = Math.abs(value);
        if (abs_value === 0.0) {
            return String(round(value, 2).toFixed(2));
        }
        if (abs_value < 0.001) {
            return String(value.toExponential(2));
        }
        if (abs_value >= 1000) {
            return String(round(value, 1).toFixed(1));
        }
        if (abs_value >= 100.0) {
            return String(round(value, 2).toFixed(2));
        }
        if (abs_value < 0.01 && abs_value >= 0.001) {
            return String(round(value, 4).toFixed(4));
        }
        return String(round(value, 3).toFixed(3));
    };
}

export default AdaptivePrecisionCell;
