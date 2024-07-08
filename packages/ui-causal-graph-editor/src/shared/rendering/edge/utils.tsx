/**
 * Calculates the x and y position that the edge should be connected to a square node
 * Note that we do not take into account the rounded edges of the square, if required the below can be modified to include it
 *
 * @param centerX center x coordinate of the square node
 * @param centerY center y coordinate of the square node
 * @param rotation goes from -pi to pi inclusive and represents the angle between the x axis going counterclockwise to the edge from the centre of source node
 * @param width of the square node
 */
export function calculateSourceBoundPosition(
    centerX: number,
    centerY: number,
    rotation: number,
    width: number
): { x: number; y: number } {
    // Calculate half size of the square
    const halfSize = width / 2;

    let x;
    let y;

    if (rotation >= 0 && rotation < Math.PI / 4) {
        // edge leaves from somewhere on the right top half side of the square
        x = centerX + halfSize;
        y = centerY + Math.tan(rotation) * halfSize;
    } else if (rotation >= Math.PI / 4 && rotation < Math.PI / 2) {
        // edge leaves from somewhere on the top right half side of the square
        x = centerX + Math.tan(Math.PI / 2 - rotation) * halfSize;
        y = centerY + halfSize;
    } else if (rotation >= Math.PI / 2 && rotation < (3 * Math.PI) / 4) {
        // edge leaves from somewhere on the top left half side of the square
        x = centerX - Math.tan(rotation - Math.PI / 2) * halfSize;
        y = centerY + halfSize;
    } else if (rotation >= Math.PI / 4 && rotation < 3 * Math.PI) {
        // edge leaves from somewhere on the left top half side of the square
        x = centerX - halfSize;
        y = centerY + Math.tan(Math.PI - rotation) * halfSize;
    } else if (rotation <= 0 && rotation > -Math.PI / 4) {
        // edge leaves from somewhere on the left bottom half side of the square
        y = centerY + Math.tan(Math.PI + rotation) * halfSize;
        x = centerX + halfSize;
    } else if (rotation <= -Math.PI / 4 && rotation > -Math.PI / 2) {
        // edge leaves from somewhere on the bottom left half side of the square
        x = centerX - Math.tan(-rotation - Math.PI / 2) * halfSize;
        y = centerY - halfSize;
    } else if (rotation <= -Math.PI / 2 && rotation > (-3 * Math.PI) / 4) {
        // edge leaves from somewhere on the bottom right half side of the square
        x = centerX + Math.tan(Math.PI / 2 + rotation) * halfSize;
        y = centerY - halfSize;
    } else {
        // edge leaves from somewhere on the right bottom half side of the square
        x = centerX - halfSize;
        y = centerY + Math.tan(-rotation) * halfSize;
    }
    return { x, y };
}

/**
 * Calculates the x and y position that the edge should be connected to a square node
 * Note that we do not take into account the rounded edges of the square, if required the below can be modified to include it
 *
 * @param centerX center x coordinate of the square node
 * @param centerY center y coordinate of the square node
 * @param rotation goes from -pi to pi inclusive and represents the angle between the x axis going counterclockwise to the edge from the centre of source node
 * @param width width of the square node
 */
export function calculateTargetBoundPosition(
    centerX: number,
    centerY: number,
    rotation: number,
    width: number
): { x: number; y: number } {
    // Calculate half size of the square
    const halfSize = width / 2;

    let x;
    let y;

    if (rotation >= 0 && rotation < Math.PI / 4) {
        // edge arrives from somewhere on the left bottom half side of the square
        x = centerX - halfSize;
        y = centerY - Math.tan(rotation) * halfSize;
    } else if (rotation >= Math.PI / 4 && rotation < Math.PI / 2) {
        // edge arrives from somewhere on the left bottom half side of the square
        x = centerX - Math.tan(Math.PI / 2 - rotation) * halfSize;
        y = centerY - halfSize;
    } else if (rotation >= Math.PI / 2 && rotation < (3 * Math.PI) / 4) {
        // edge arrives from somewhere on the bottom right half side of the square
        x = centerX + Math.tan(rotation - Math.PI / 2) * halfSize;
        y = centerY - halfSize;
    } else if (rotation >= Math.PI / 4 && rotation < 3 * Math.PI) {
        // edge arrives from somewhere on the right bottom half side of the square
        x = centerX + halfSize;
        y = centerY - Math.tan(Math.PI - rotation) * halfSize;
    } else if (rotation <= 0 && rotation > -Math.PI / 4) {
        // edge arrives from somewhere on the right top half side of the square
        x = centerX - halfSize;
        y = centerY - Math.tan(Math.PI + rotation) * halfSize;
    } else if (rotation <= -Math.PI / 4 && rotation > -Math.PI / 2) {
        // edge arrives from somewhere on the top right half side of the square
        x = centerX + Math.tan(-rotation - Math.PI / 2) * halfSize;
        y = centerY + halfSize;
    } else if (rotation <= -Math.PI / 2 && rotation > (-3 * Math.PI) / 4) {
        // edge arrives from somewhere on the top left half side of the square
        x = centerX - Math.tan(Math.PI / 2 + rotation) * halfSize;
        y = centerY + halfSize;
    } else {
        // edge arrives from somewhere on the left top half side of the square
        x = centerX + halfSize;
        y = centerY - Math.tan(-rotation) * halfSize;
    }
    return { x, y };
}
