import { Badge } from '@darajs/ui-components';

interface BadgeInterface {
    color: string;
    label: any;
}

type BadgesInterface = {
    [key in string | number | symbol]: BadgeInterface;
};

interface BadgeFormattedCellProps {
    value: any;
}

/**
 * A badge formatting cell, returns a cell with a badge corresponding to the badges defined by the user.
 * For a value which doesn't match any of the badges, the value is directly displayed.
 *
 * @param badges the desired badges that contain the color and label for each badge
 */
function BadgeFormattedCell(badges: BadgesInterface): (props: BadgeFormattedCellProps) => JSX.Element {
    function FormattedBadge({ value }: BadgeFormattedCellProps): JSX.Element {
        return badges[value] ? (
            <Badge color={badges[value].color} width="100%">
                {badges[value].label}
            </Badge>
        ) : (
            <span>{value}</span>
        );
    }
    return FormattedBadge;
}

export default BadgeFormattedCell;
