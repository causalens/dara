import { Action, ComponentInstance, StyledComponentProps, Variable } from '@darajs/core';

export interface ComponentItem {
    component: ComponentInstance;
    subtitle?: string;
    title: string;
}

export enum BreakpointsTypes {
    lg = 'lg',
    md = 'md',
    sm = 'sm',
    xl = 'xl',
    xs = 'xs',
}

export type Breakpoints = Record<BreakpointsTypes, number>;

/**
 * Interactive Form Component props
 */
export interface FormComponentProps extends StyledComponentProps {
    /** id representing key to updte in the form if component value changes. */
    id?: string;
    /** Action triggered when the component value has changed. */
    onchange?: Action;
    /** The value Variable to display and update */
    value?: Variable<any>;
}
