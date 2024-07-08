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
import { EdgeEditorProps } from './editor-props';
import { EdgeTypeEditor } from './sections';

/**
 * EdgeEditor for PAG EditorMode
 */
function PagEditor(props: EdgeEditorProps): JSX.Element {
    return (
        <>
            <EdgeTypeEditor
                api={props.api}
                edge={props.edge}
                source={props.source}
                state={props.state}
                target={props.target}
            />
        </>
    );
}

export default PagEditor;
