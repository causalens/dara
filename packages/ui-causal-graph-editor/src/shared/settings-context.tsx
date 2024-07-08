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
import * as React from 'react';

import { NotificationPayload } from '@darajs/ui-notifications';

import { EditorMode } from '../types';

/**
 * Common graph settings used inside graph sub-components
 */
export interface Settings {
    /** Whether node dragging is enabled */
    allowNodeDrag?: boolean;
    /** Whether to show the details panel when the graph is not editable */
    allowSelectionWhenNotEditable?: boolean;
    /** Flag for disabling edge addition */
    disableEdgeAdd?: boolean;
    /** Flag for disabling latent node addition */
    disableLatentNodeAdd?: boolean;
    /** Flag for disabling node removal */
    disableNodeRemoval?: boolean;
    /** Allow editing */
    editable?: boolean;
    /** Mode the graph viewer should operate in */
    editorMode?: EditorMode;
    /** On notify handler to show a notification */
    onNotify?: (payload: NotificationPayload) => void | Promise<void>;
    /** Whether to show verbose descriptions in the editor frame */
    verboseDescriptions?: boolean;
}

const SettingsContext = React.createContext<Settings | undefined>(undefined);

interface SettingsProviderProps {
    children: React.ReactNode;
    settings: Settings;
}

/**
 * Wrapper around SettingsContext which requires settings to be set
 */
export function SettingsProvider({ children, settings }: SettingsProviderProps): JSX.Element {
    return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}

/**
 * Helper hook that pulls in Settings from the SettingsContext
 */
export function useSettings(): Settings {
    const settings = React.useContext(SettingsContext);

    if (settings === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }

    return settings;
}
