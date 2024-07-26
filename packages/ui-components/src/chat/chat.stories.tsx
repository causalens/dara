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
import { Meta } from '@storybook/react';
import * as React from 'react';

import { WandSparkles } from '@darajs/ui-icons';

// import Spinner from '../spinner/spinner';
import { UserData } from '../types';
import { default as ChatComponent } from './chat';

export default {
    component: ChatComponent,
    title: 'UI Components/Chat',
} as Meta;

const Hagrid: UserData = {
    name: 'Rubeus Hagrid',
    id: 'hagrid_id',
};

const Harry: UserData = {
    name: 'Harry Potter',
    id: 'harry_id',
};

const Custom: UserData = {
    name: 'Custom',
    id: 'custom_id',
    color: 'teal',
    bubbleContent: <WandSparkles />,
};

const messages = [
    {
        id: 'yYZ1_TTZbL9is7RhG_C0l',
        message: '{puts cake down} \n Excuse me, who are you?',
        created_at: '2024-04-03T10:34:05.167Z',
        updated_at: '2024-04-03T10:34:05.167Z',
        user: Harry,
    },
    {
        id: 'oGbwtu9PHMVNYbFfxN7Br',
        message: "Rubeus Hagrid. Keeper of keys and grounds at Hogwarts. Course, you'll know all about Hogwarts.",
        created_at: '2024-04-03T10:34:17.167Z',
        updated_at: '2024-04-03T10:34:17.167Z',
        user: Hagrid,
    },
    {
        id: 'ocRSEZU9DeILt8MvyKu0b',
        message: 'Sorry, no.',
        created_at: '2024-04-03T10:34:26.944Z',
        updated_at: '2024-04-03T10:34:45.061Z',
        user: Harry,
    },
    {
        id: 'ctDqA50c0b13FQKY0E1tm',
        message: "No? Blimey, Harry, didn't you ever wonder where your mum and dad learned it all?",
        created_at: '2024-04-03T15:55:05.031Z',
        updated_at: '2024-04-03T15:55:05.031Z',
        user: Hagrid,
    },
    {
        id: 'ocRSEZU9DeILt8MvyKu07',
        message: 'Learnt what?',
        created_at: '2024-04-03T15:56:26.944Z',
        updated_at: '2024-04-03T15:56:45.061Z',
        user: Harry,
    },
    {
        id: 'ctDqA50c0b13FQKY0E1tp',
        message: "You're a **wizard**, Harry.",
        created_at: '2024-04-03T15:57:26.944Z',
        updated_at: '2024-04-03T15:57:26.944Z',
        user: Hagrid,
    },
    {
        id: 'ctDqA50c0b13FQKY0E1tf',
        message: 'Magic! \n ```python \n def foo():\n  return \n ``` \n Some other stuff',
        created_at: '2024-07-03T15:57:26.944Z',
        updated_at: '2024-07-03T15:57:26.944Z',
        user: Custom,
        actions: [
            <button type="button" key="test-key" onClick={() => console.log('this was indeed clicked')}>
                Click me
            </button>,
        ] as React.ReactNode[],
    },
    {
        id: 'ctDqA50c0b13FQKY0E1tf',
        message: 'Unsupported language \n ```custom \n fn foo():\n  return \n ``` \n Some other stuff',
        created_at: '2024-07-03T15:57:26.944Z',
        updated_at: '2024-07-03T15:57:26.944Z',
        user: Custom,
    },
    {
        id: 'ctDqA50c0b13FQKY0E1tf',
        message: 'No language specified \n ```\nfn foo():\n  return \n ``` \n Some other stuff',
        created_at: '2024-07-03T15:57:26.944Z',
        updated_at: '2024-07-03T15:57:26.944Z',
        user: Custom,
    },
    {
        id: 'ctDqA50c0b13FQKY0E1tf',
        message: 'Inline block! \n `foo = lambda x: x + 1` \n Some other stuff',
        created_at: '2024-07-03T15:57:26.944Z',
        updated_at: '2024-07-03T15:57:26.944Z',
        user: Custom,
    },
];

export const Chat = (): JSX.Element => {
    const [value, setValue] = React.useState(messages);

    return (
        <div style={{ backgroundColor: 'white', display: 'flex', height: '100%' }}>
            <ChatComponent
                activeUser={Harry}
                onUpdate={setValue}
                value={value}
                // loadingComponent={<Spinner size='1rem' text='typing' />}
            />
        </div>
    );
};
