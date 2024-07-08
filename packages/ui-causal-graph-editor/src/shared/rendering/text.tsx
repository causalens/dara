/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as PIXI from 'pixi.js';

export const FONT_FAMILY = 'Manrope';

/**
 * Get default text style to display in nodes
 *
 * @param size text size
 */
export function getTextStyle(size: number): PIXI.TextStyle {
    return new PIXI.TextStyle({
        align: 'center',
        fill: 0xffffff,
        fontFamily: FONT_FAMILY,
        fontSize: size,
        fontWeight: 'normal',
        lineHeight: 1.2 * size,
        whiteSpace: 'normal',
        wordWrap: true,
    });
}

/**
 * Trim given text to fit within maximum size
 *
 * @param text text to fit
 * @param maxSize max vertical and horizontal size
 * @param textStyle pixi text style
 */
export function trimToFit(text: string, maxSize: number, textStyle: PIXI.TextStyle): string {
    // Measure the size of the text
    const { height, maxLineWidth, lines, lineWidths, lineHeight } = PIXI.TextMetrics.measureText(text, textStyle);

    // if either height or width of the text doesn't fit in the node, truncate it
    const overflows = height >= maxSize || maxLineWidth >= maxSize;

    if (!overflows) {
        return text;
    }

    // First figure out how many lines we could fit vertically
    const linesFitVertical = Math.floor(maxSize / lineHeight);

    // No lines fit vertically, edge case - just return first line
    if (linesFitVertical === 0) {
        return lines[0];
    }

    const finalText = [];
    let offendingLine = null;

    // Then pick how many of those fit horizontally
    for (let i = 0; i < Math.min(linesFitVertical, lines.length); i++) {
        const line = lines[i];
        const lineWidth = lineWidths[i];

        if (lineWidth >= maxSize) {
            offendingLine = line;
            break;
        }

        finalText.push(line.trim());
    }

    // If no line was too wide, just add ellipsis to last line that fits
    if (!offendingLine) {
        // If that line is <= 3 characters, leave it as is
        if (finalText[finalText.length - 1].length > 3) {
            finalText[finalText.length - 1] = `${finalText[finalText.length - 1].slice(0, -3)}...`;
        }

        return finalText.join('\n');
    }

    // split the line to have one letter/space per line so we can measure their widths
    const letters = offendingLine.split('');
    const textLetterPerLine = `...\n${letters.join('\n')}`;

    // For the next calculation use a different whitespace setting so it gets the lengths correctly
    const textStyleWhiteSpace = textStyle.clone();
    textStyleWhiteSpace.whiteSpace = 'pre-line';

    // Calculate width of space, dots, and each letter
    const [dotsLength, ...letterLengths] = PIXI.TextMetrics.measureText(
        textLetterPerLine,
        textStyleWhiteSpace
    ).lineWidths;

    // Compute which part of text we can fit in
    let trimmedText = '';
    let currentLength = dotsLength;

    for (let i = 0; i < letterLengths.length; i++) {
        const letterLength = letterLengths[i];
        const letter = letters[i];

        // If adding the letter would overflow, stop adding more
        if (currentLength + letterLength >= maxSize) {
            break;
        }

        trimmedText += letter;
        currentLength += letterLength;
    }

    // If no part fits (somehow, font size must be very large) just leave the offending line as-is
    if (trimmedText.length === 0) {
        finalText.push(offendingLine);
    } else {
        finalText.push(`${trimmedText.trim()}...`);
    }

    return finalText.join(' ');
}
