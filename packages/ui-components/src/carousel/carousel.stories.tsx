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

import { theme } from '@darajs/styled-components';

import Badge from '../badge/badge';
import { CarouselItem } from '../types';
import { default as CarouselComponent, CarouselProps } from './carousel';

export default {
    component: CarouselComponent,
    title: 'UI Components/Carousel',
} as Meta;

const Template = (args: CarouselProps): JSX.Element => (
    <div style={{ display: 'flex', height: '400px' }}>
        <CarouselComponent {...args} />
    </div>
);

const simpleItems: CarouselItem[] = [
    {
        subtitle:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Netus et malesuada fames ac turpis. Molestie a iaculis at erat pellentesque adipiscing commodo elit at. Vel pharetra vel turpis nunc. Turpis massa tincidunt dui ut ornare. Aliquam etiam erat velit scelerisque in dictum non consectetur. Sapien nec sagittis aliquam malesuada bibendum arcu. Elit sed vulputate mi sit amet mauris. Vulputate ut pharetra sit amet aliquam. Vestibulum lorem sed risus ultricies tristique nulla. Quisque non tellus orci ac auctor augue. Posuere urna nec tincidunt praesent semper feugiat nibh sed. Sapien pellentesque habitant morbi tristique senectus et netus. Suspendisse in est ante in nibh. Ipsum consequat nisl vel pretium lectus quam. Tellus id interdum velit laoreet id donec. Egestas sed tempus urna et pharetra pharetra. Elit ullamcorper dignissim cras tincidunt. Dictumst vestibulum rhoncus est pellentesque elit. Sed id semper risus in hendrerit gravida rutrum quisque non. Varius vel pharetra vel turpis nunc eget lorem dolor sed. Nibh mauris cursus mattis molestie. Nisi quis eleifend quam adipiscing vitae proin sagittis nisl. Faucibus ornare suspendisse sed nisi lacus sed viverra tellus in. Suspendisse interdum consectetur libero id faucibus nisl. Tellus cras adipiscing enim eu turpis egestas pretium aenean. Risus commodo viverra maecenas accumsan lacus vel facilisis volutpat. Placerat in egestas erat imperdiet sed euismod nisi porta. Tortor condimentum lacinia quis vel eros donec. Ac orci phasellus egestas tellus. Cras semper auctor neque vitae tempus quam pellentesque nec nam. Tristique senectus et netus et malesuada fames ac turpis. Sed id semper risus in hendrerit. Lectus magna fringilla urna porttitor rhoncus dolor purus non enim. Et molestie ac feugiat sed lectus vestibulum mattis ullamcorper. Aliquam nulla facilisi cras fermentum odio eu. Metus vulputate eu scelerisque felis imperdiet proin fermentum leo. Even more text is being added in the hope it will overflow and i will be able to finllly found out what is happenng ldlv',
        title: 'First',
    },
    {
        subtitle: 'Long Label',
        title: 'Second',
    },
    {
        subtitle: 'Third Chip',
        title: 'Third',
    },
    {
        subtitle: 'What if the label is too longs',
        title: 'Fourth',
    },
];

const imgTextItems: CarouselItem[] = [
    {
        image: 'https://moderncat.com/wp-content/uploads/2021/01/bigstock-Domestic-Cat-Beautiful-Old-Ca-353858042.png',
        subtitle:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Netus et malesuada fames ac turpis. Molestie a iaculis at erat pellentesque adipiscing commodo elit at. Vel pharetra vel turpis nunc. Turpis massa tincidunt dui ut ornare. Aliquam etiam erat velit scelerisque in dictum non consectetur. Sapien nec sagittis aliquam malesuada bibendum arcu. Elit sed vulputate mi sit amet mauris. Vulputate ut pharetra sit amet aliquam. Vestibulum lorem sed risus ultricies tristique nulla. Quisque non tellus orci ac auctor augue. Posuere urna nec tincidunt praesent semper feugiat nibh sed. Sapien pellentesque habitant morbi tristique senectus et netus. Suspendisse in est ante in nibh. Ipsum consequat nisl vel pretium lectus quam. Tellus id interdum velit laoreet id donec. Egestas sed tempus urna et pharetra pharetra.',
        title: 'First',
    },
    {
        image: 'https://www.preventivevet.com/hs-fs/hubfs/pug%20treats.jpg?width=600&height=300&name=pug%20treats.jpg',
        subtitle: 'Example short text',
        title: 'Second',
    },
    {
        image: 'https://www.nwf.org/-/media/NEW-WEBSITE/Shared-Folder/Wildlife/Mammals/mammal_ringed-seal_600x300.ashx',
        subtitle: 'Example short text',
        title: 'Third',
    },
    {
        image: 'https://images.radio-canada.ca/q_auto,w_960/v1/ici-info/16x9/girafe-mere-jeune.jpg',
        subtitle:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Netus et malesuada fames ac turpis. Molestie a iaculis at erat pellentesque adipiscing commodo elit at. Vel pharetra vel turpis nunc. Turpis massa tincidunt dui ut ornare. Aliquam etiam erat velit scelerisque in dictum non consectetur. Sapien nec sagittis aliquam malesuada bibendum arcu. Elit sed vulputate mi sit amet mauris. Vulputate ut pharetra sit amet aliquam. Vestibulum lorem sed risus ultricies tristique nulla. Quisque non tellus orci ac auctor augue. Posuere urna nec tincidunt praesent semper feugiat nibh sed. Sapien pellentesque habitant morbi tristique senectus et netus. Suspendisse in est ante in nibh. Ipsum consequat nisl vel pretium lectus quam. Tellus id interdum velit laoreet id donec. Egestas sed tempus urna et pharetra pharetra.',
        title: 'Fourth',
    },
    {
        image: 'https://www.photographyaxis.com/wp-content/uploads/2018/07/Portrait-Vs-Landscape-Mode-Portrait.jpg',
        imageHeight: '10rem',
        subtitle:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Netus et malesuada fames ac turpis. Molestie a iaculis at erat pellentesque adipiscing commodo elit at. Vel pharetra vel turpis nunc. Turpis massa tincidunt dui ut ornare. Aliquam etiam erat velit scelerisque in dictum non consectetur. Sapien nec sagittis aliquam malesuada bibendum arcu. Elit sed vulputate mi sit amet mauris. Vulputate ut pharetra sit amet aliquam. Vestibulum lorem sed risus ultricies tristique nulla. Quisque non tellus orci ac auctor augue. Posuere urna nec tincidunt praesent semper feugiat nibh sed. Sapien pellentesque habitant morbi tristique senectus et netus. Suspendisse in est ante in nibh. Ipsum consequat nisl vel pretium lectus quam. Tellus id interdum velit laoreet id donec. Egestas sed tempus urna et pharetra pharetra.',
        title: 'Fifth',
    },
];

const imgItems: CarouselItem[] = [
    {
        image: 'https://moderncat.com/wp-content/uploads/2021/01/bigstock-Domestic-Cat-Beautiful-Old-Ca-353858042.png',
    },
    {
        image: 'https://www.preventivevet.com/hs-fs/hubfs/pug%20treats.jpg?width=600&height=300&name=pug%20treats.jpg',
    },
    {
        image: 'https://www.nwf.org/-/media/NEW-WEBSITE/Shared-Folder/Wildlife/Mammals/mammal_ringed-seal_600x300.ashx',
    },
    {
        image: 'https://images.radio-canada.ca/q_auto,w_960/v1/ici-info/16x9/girafe-mere-jeune.jpg',
    },
];

const complexItems: CarouselItem[] = [
    {
        component: (
            <div style={{ display: 'flex', gap: '0.25rem', padding: '0 1.5rem 1rem 1.5rem' }}>
                <Badge color={theme.colors.primary} outline>
                    Label
                </Badge>
                <Badge color={theme.colors.primary} outline>
                    Label
                </Badge>
                <Badge color={theme.colors.primary} outline>
                    Label
                </Badge>
                <Badge color={theme.colors.primary} outline>
                    Label
                </Badge>
            </div>
        ),
        subtitle: 'This component has title, subtitle and components',
        title: 'Title',
    },
    {
        component: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0 1.5rem 1rem 1.5rem' }}>
                Whereas this is a pure component
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <Badge color={theme.colors.orange}>Label</Badge>
                    <Badge color={theme.colors.teal}>Label</Badge>
                    <Badge color={theme.colors.violet}>Label</Badge>
                </div>
            </div>
        ),
    },
];

export const TextCarousel = Template.bind({});

TextCarousel.args = {
    items: simpleItems,
};

export const ImgCarousel = Template.bind({});

ImgCarousel.args = {
    items: imgItems,
    style: { flex: '0 0 500px' },
};

export const ImageTextCarousel = Template.bind({});

ImageTextCarousel.args = {
    items: imgTextItems,
    style: { flex: '0 0 500px' },
};

export const ComplexCarousel = Template.bind({});

ComplexCarousel.args = {
    items: complexItems,
};
