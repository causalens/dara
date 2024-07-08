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

import { Status } from '@darajs/ui-utils';

import { default as NotificationComponent, NotificationProps } from './notification';
import { NotificationPayload } from './notification-payload';

export default {
    component: NotificationComponent,
    title: 'UI Components/Notification',
} as Meta;

const Template = (args: NotificationProps): JSX.Element => <NotificationComponent {...args} />;

const infoMessage: NotificationPayload = {
    key: 'test',
    message: 'It is a useful piece of information, check it out. I want to make this overflow.',
    status: Status.CREATED,
};

export const InfoNotification = Template.bind({});

InfoNotification.args = {
    notification: infoMessage,
};

const infoTitleMessage: NotificationPayload = {
    key: 'test',
    message: 'It is a useful piece of information, check it out. I want to make this overflow.',
    status: Status.CREATED,
    title: 'Information',
};

export const TitleInfoNotification = Template.bind({});

TitleInfoNotification.args = {
    notification: infoTitleMessage,
};

const successMessage: NotificationPayload = {
    key: 'test',
    message: 'Your job is complete, congratulations!',
    status: Status.SUCCESS,
    title: 'Success',
};

export const SuccessNotification = Template.bind({});

SuccessNotification.args = {
    notification: successMessage,
};

const warningMessage: NotificationPayload = {
    key: 'test',
    message: 'This might cause a trouble, be careful.',
    status: Status.WARNING,
    title: 'Warning',
};

export const WarningNotification = Template.bind({});

WarningNotification.args = {
    notification: warningMessage,
};

const errorMessage: NotificationPayload = {
    key: 'test',
    message: 'Try again or contact the application owner.',
    status: Status.ERROR,
    title: 'Error',
};

export const ErrorNotification = Template.bind({});

ErrorNotification.args = {
    notification: errorMessage,
};

const longWarning: NotificationPayload = {
    key: 'test',
    message:
        'Duis interdum gravida metus, vel faucibus leo euismod id. Suspendisse felis enim, consequat eu' +
        'felis imperdiet, efficitur semper turpis. Nam felis ex, viverra eu nisl ut, imperdiet varius lacus. Curabitur ' +
        'convallis vel nibh at lobortis. Morbi eget fermentum ligula. Nullam at justo diam. Ut accumsan fringilla metus quis pretium.' +
        ' Vestibulum magna lectus, commodo vel nibh sed, posuere ultrices nisl. Integer rutrum, augue vel interdum hendrerit,' +
        ' est lacus interdum risus, ac feugiat enim velit id arcu. Integer maximus mi a mollis faucibus. Nulla vitae tincidunt libero, ' +
        'et porttitor lectus. Donec eleifend turpis ut sapien cursus fringilla. Cras non diam convallis, tincidunt felis vitae, tristique mi. ' +
        'Nulla dolor lacus, interdum sit amet ornare ut, luctus ac quam. Vestibulum sollicitudin nec leo nec vestibulum. Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    status: Status.WARNING,
    title: 'Warning',
};

export const LongWarning = Template.bind({});
LongWarning.args = {
    notification: longWarning,
    onMoreDetailsClick: (
        e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
        notificationPayload: NotificationPayload
    ) => {
        e.preventDefault();

        // this alert is used for testing purposes only
        // eslint-disable-next-line no-alert
        alert(notificationPayload.message);
    },
};

const longInfo: NotificationPayload = {
    key: 'test',
    message:
        'This is quite a long notification for testing purposes. It should be long enough to overflow the container.',
    status: Status.CREATED,
    title: 'Information',
};
export const LongInformation = Template.bind({});
LongInformation.args = {
    notification: longInfo,
    onMoreDetailsClick: (
        e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
        notificationPayload: NotificationPayload
    ) => {
        e.preventDefault();
        // this alert is used for testing purposes only
        // eslint-disable-next-line no-alert
        alert(notificationPayload.message);
    },
};
