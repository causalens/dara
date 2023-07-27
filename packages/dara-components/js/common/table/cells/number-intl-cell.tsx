interface NumberIntlCellProps {
    value: any;
}

/**
 * A number intl formatting cell, returns a string formatted by Intl.NumberFormat.
 *
 * @param precision the desired precision to render the value with
 */
function NumberIntlCell(
    locales: string | string[],
    options: Intl.NumberFormatOptions
): (props: NumberIntlCellProps) => string {
    const formatter = Intl.NumberFormat(locales, options);

    return ({ value }: NumberIntlCellProps): string => {
        if (Number.isNaN(Number(value))) {
            return value ?? null;
        }

        return formatter.format(value);
    };
}

export default NumberIntlCell;
