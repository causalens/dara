interface ThresholdInterface {
    bounds: Array<number>;
    color: string;
}

interface ThresholdFormattedCellProps {
    value: number;
}

/**
 * A number formatting cell, returns a colored cell for numbers within the thresholds
 *
 * @param thresholds the desired thresholds and respective colors
 */
function ThresholdFormattedCell(
    thresholds: Array<ThresholdInterface>
): (props: ThresholdFormattedCellProps) => JSX.Element {
    function FormattedText({ value }: ThresholdFormattedCellProps): JSX.Element {
        if (Number.isNaN(Number(value))) {
            return null;
        }
        return (
            <span
                style={{
                    color: thresholds.find((threshold) => threshold.bounds[0] <= value && value < threshold.bounds[1])
                        ?.color,
                }}
            >
                {value}
            </span>
        );
    }
    return FormattedText;
}

export default ThresholdFormattedCell;
