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
/**
 * Copy given text to the clipboard.
 * Falls back to a deprecated `execCommand` method in case the newer APi isn't available,
 * i.e. in an older browser (see: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText#browser_compatibility)
 * or in HTTP mode.
 *
 * @param value value to put into clipboard
 */
export async function copyToClipboard(value: string): Promise<boolean> {
    let success = true;

    // If "new" API is available
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            success = false;
        }
    } else {
        // Fallback
        const tempComponent = document.createElement('textarea');
        tempComponent.value = value;
        tempComponent.style.top = '0';
        tempComponent.style.left = '0';
        tempComponent.style.position = 'fixed';
        document.body.appendChild(tempComponent);
        tempComponent.focus();
        tempComponent.select();

        try {
            success = document.execCommand('copy');
        } catch {
            success = false;
        }

        document.body.removeChild(tempComponent);
    }

    return success;
}
