import { getMarkerPaths, hasTemplateMarkers, replaceMarkers } from '../../js/shared';
import { ComponentInstance, TemplatedComponentInstance } from '../../js/types';

describe('Templating', () => {
    it('should identify marker paths', () => {
        const template = {
            name: 'TemplatedComponentInstance',
            props: {
                children: [
                    {
                        name: 'TestChildComponent',
                        props: {
                            test_prop: {
                                __typename: 'TemplateMarker',
                                field_name: 'test_field',
                            },
                        },
                    },
                ],
                raw_css: {
                    __typename: 'TemplateMarker',
                    field_name: 'raw_css_field',
                },
                templated: true,
            },
        };

        expect(hasTemplateMarkers(template as unknown as ComponentInstance)).toBe(true);
        const paths = getMarkerPaths(template as unknown as ComponentInstance & TemplatedComponentInstance);

        expect(paths).toEqual({
            'props.children.0.props.test_prop': 'test_field',
            'props.raw_css': 'raw_css_field',
        });
    });

    it('should replace marker paths with data', () => {
        const template = {
            name: 'TemplatedComponentInstance',
            props: {
                children: [
                    {
                        name: 'TestChildComponent',
                        props: {
                            test_prop: {
                                __typename: 'TemplateMarker',
                                field_name: 'test_field',
                            },
                        },
                    },
                ],
                raw_css: {
                    __typename: 'TemplateMarker',
                    field_name: 'raw_css_field',
                },
                templated: true,
            },
        };

        const data = {
            raw_css_field: 'raw_css_value',
            test_field: 'test_value',
        };

        const paths = getMarkerPaths(template as unknown as ComponentInstance & TemplatedComponentInstance);
        const replaced = replaceMarkers(
            template as unknown as ComponentInstance & TemplatedComponentInstance,
            data,
            paths
        );
        expect(replaced).toEqual({
            name: 'TemplatedComponentInstance',
            props: {
                children: [
                    {
                        name: 'TestChildComponent',
                        props: {
                            test_prop: 'test_value',
                        },
                    },
                ],
                raw_css: 'raw_css_value',
                templated: true,
            },
        });
    });
});
