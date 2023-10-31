import {
    BeforePlotEvent,
    ClickAnnotationEvent,
    FrameAnimationEvent,
    LegendClickEvent,
    PlotDatum,
    PlotHoverEvent,
    PlotMouseEvent,
    PlotRelayoutEvent,
    PlotRestyleEvent,
    PlotSelectionEvent,
    SliderChangeEvent,
    SliderEndEvent,
    SliderStartEvent,
    SunburstClickEvent,
} from 'plotly.js';
import { useState } from 'react';
import Plot, { PlotParams } from 'react-plotly.js';
import AutoSizer from 'react-virtualized-auto-sizer';

import { Action, StyledComponentProps, injectCss, useAction, useComponentStyles } from '@darajs/core';

/**
 * Names defined by plotly.js, this is what Python will send us
 */
enum PlotlyEventName {
    AfterExport = 'plotly_afterexport',
    AfterPlot = 'plotly_afterplot',
    Animated = 'plotly_animated',
    AnimatingFrame = 'plotly_animatingframe',
    AnimationInterrupted = 'plotly_animationinterrupted',
    AutoSize = 'plotly_autosize',
    BeforeExport = 'plotly_beforeexport',
    BeforeHover = 'plotly_beforehover',
    ButtonClicked = 'plotly_buttonclicked',
    Click = 'plotly_click',
    ClickAnnotation = 'plotly_clickannotation',
    Deselect = 'plotly_deselect',
    DoubleClick = 'plotly_doubleclick',
    Framework = 'plotly_framework',
    Hover = 'plotly_hover',
    LegendClick = 'plotly_legendclick',
    LegendDoubleClick = 'plotly_legenddoubleclick',
    Redraw = 'plotly_redraw',
    Relayout = 'plotly_relayout',
    Restyle = 'plotly_restyle',
    Selected = 'plotly_selected',
    Selecting = 'plotly_selecting',
    SliderChange = 'plotly_sliderchange',
    SliderEnd = 'plotly_sliderend',
    SliderStart = 'plotly_sliderstart',
    TransitionInterrupted = 'plotly_transitioninterrupted',
    Transitioning = 'plotly_transitioning',
    Unhover = 'plotly_unhover',
    WebglContextLost = 'plotly_webglcontextlost',
}

/**
 * eventHandlersMap maps the plotly.js event names to the names we need for Plot component props
 */
const eventHandlersMap = {
    [PlotlyEventName.Click]: 'onClick',
    [PlotlyEventName.Hover]: 'onHover',
    [PlotlyEventName.Selecting]: 'onSelecting',
    [PlotlyEventName.Selected]: 'onSelected',
    [PlotlyEventName.Unhover]: 'onUnhover',
    [PlotlyEventName.SliderChange]: 'onSliderChange',
    [PlotlyEventName.AnimationInterrupted]: 'onAnimationInterrupted',
    [PlotlyEventName.AnimatingFrame]: 'onAnimatingFrame',
    [PlotlyEventName.Animated]: 'onAnimated',
    [PlotlyEventName.BeforeHover]: 'onBeforeHover',
    [PlotlyEventName.ButtonClicked]: 'onButtonClicked',
    [PlotlyEventName.ClickAnnotation]: 'onClickAnnotation',
    [PlotlyEventName.Deselect]: 'onDeselect',
    [PlotlyEventName.DoubleClick]: 'onDoubleClick',
    [PlotlyEventName.Framework]: 'onFramework',
    [PlotlyEventName.LegendClick]: 'onLegendClick',
    [PlotlyEventName.LegendDoubleClick]: 'onLegendDoubleClick',
    [PlotlyEventName.Redraw]: 'onRedraw',
    [PlotlyEventName.Relayout]: 'onRelayout',
    [PlotlyEventName.Restyle]: 'onRestyle',
    [PlotlyEventName.TransitionInterrupted]: 'onTransitionInterrupted',
    [PlotlyEventName.Transitioning]: 'onTransitioning',
    [PlotlyEventName.WebglContextLost]: 'onWebGlContextLost',
    [PlotlyEventName.SliderEnd]: 'onSliderEnd',
    [PlotlyEventName.SliderStart]: 'onSliderStart',
    [PlotlyEventName.BeforeExport]: 'onBeforeExport',
    [PlotlyEventName.AfterExport]: 'onAfterExport',
    [PlotlyEventName.AfterPlot]: 'onAfterPlot',
    [PlotlyEventName.AutoSize]: 'onAutoSize',
} as const;

type EventHandlersMap = typeof eventHandlersMap;

/**
 * Pick only the event handlers from the PlotParams type, to have a map of the event handlers to their data types
 */
type RequiredPlotParams = Pick<Required<PlotParams>, EventHandlersMap[keyof EventHandlersMap]>;

/**
 * Type containing an union of all the event data types
 */
type PlotlyEventData =
    | PlotHoverEvent
    | PlotMouseEvent
    | PlotSelectionEvent
    | PlotRestyleEvent
    | PlotRelayoutEvent
    | ClickAnnotationEvent
    | FrameAnimationEvent
    | LegendClickEvent
    | SliderChangeEvent
    | SliderEndEvent
    | SliderStartEvent
    | SunburstClickEvent
    | BeforePlotEvent;

/**
 * Event object as passed from Python
 */
interface Event {
    actions: Array<Action>;
    custom_js: string;
    event_name: PlotlyEventName;
}

/**
 * Props for the Plotly component
 */
interface PlotlyProps extends StyledComponentProps {
    /** An array of event objects */
    events?: Array<Event>;
    /** A string containing the JSON object of figure properties */
    figure: string;
}

/**
 * Object type that is used to execute both Dara actions and custom JS actions defined by the user
 */
interface ActionEvent {
    custom_js: string;
    handler?: (value: any) => Promise<void>;
}

/**
 *
 * Filters the event data received from plotly to remove large objects that cause JSON stringify circular structure errors.
 * Taken and adapted from https://github.com/plotly/dash/blob/dev/components/dash-core-components/src/fragments/Graph.react.js#L55
 *
 * @param figure - the plotly figure
 * @param eventData - the data from the event
 * @param event - the name of the event
 * @returns - the filtered event data
 */
function filterEventData<T extends PlotlyEventName>(
    figure: any,
    eventData: Parameters<RequiredPlotParams[EventHandlersMap[T]]>[0],
    event: T
): any {
    let filteredEventData: Record<string, any>;

    if ([PlotlyEventName.Click, PlotlyEventName.Hover, PlotlyEventName.Selected].includes(event)) {
        const points = [];

        const pointEventData = eventData as PlotHoverEvent | PlotMouseEvent | PlotSelectionEvent;

        if (!pointEventData) {
            return null;
        }

        /*
         * remove `data`, `layout`, `xaxis`, etc
         * objects from the event data since they're so big
         * and cause JSON stringify ciricular structure errors.
         *
         * also, pull down the `customdata` point from the data array
         * into the event object
         */
        const { data } = figure;

        for (let i = 0; i < pointEventData.points.length; i++) {
            const fullPoint = pointEventData.points[i];

            const pointData = Object.fromEntries(
                Object.entries(fullPoint).filter(([, value]: [keyof PlotDatum, PlotDatum[keyof PlotDatum]]) => {
                    return typeof value !== 'object' && !Array.isArray(value);
                })
            ) as PlotDatum & Record<'bbox' | 'pointNumbers', any>;

            // permit a bounding box to pass through, if present
            if ('bbox' in fullPoint) {
                pointData.bbox = fullPoint.bbox;
            }

            if (fullPoint?.curveNumber && data[pointData.curveNumber]?.customdata) {
                if (fullPoint.pointNumber) {
                    if (typeof fullPoint.pointNumber === 'number') {
                        pointData.customdata = data[pointData.curveNumber].customdata[fullPoint.pointNumber];
                    } else if (!fullPoint.pointNumber && fullPoint.data.mode.includes('lines')) {
                        pointData.customdata = data[pointData.curveNumber].customdata;
                    }
                } else if ('pointNumbers' in fullPoint) {
                    pointData.customdata = (fullPoint.pointNumbers as any).map((point: any) => {
                        return data[pointData.curveNumber].customdata[point];
                    });
                }
            }

            // specific to histogram. see https://github.com/plotly/plotly.js/pull/2113/
            if ('pointNumbers' in fullPoint) {
                pointData.pointNumbers = fullPoint.pointNumbers;
            }

            points[i] = pointData;
        }
        filteredEventData = { points };
    } else if (event === PlotlyEventName.Relayout || event === PlotlyEventName.Restyle) {
        /*
         * relayout shouldn't include any big objects
         * it will usually just contain the ranges of the axes like
         * "xaxis.range[0]": 0.7715822247381828,
         * "xaxis.range[1]": 3.0095292008680063`
         */
        filteredEventData = eventData;
    }
    if ('range' in eventData) {
        filteredEventData.range = eventData.range;
    }
    if ('lassoPoints' in eventData) {
        filteredEventData.lassoPoints = eventData.lassoPoints;
    }
    return filteredEventData;
}

/**
 *
 * Executes the custom js for a given event
 *
 * @param customJs - the custom js string to execute
 * @param eventData - the data from the event
 * @param figure - the plotly figure
 * @returns - the new figure obtained by the customJS function
 */
function executeCustomJs(customJs: string, eventData: Readonly<PlotlyEventData>, figure: JSON): any {
    // function running under eval is not run underst strict mode, therefore we need to prepend it
    const customJsFunction = `
    return (function(data, figure) {
      'use strict';
      ${customJs}
      return figure;
    })(data, figure);
  `;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const userFunction = new Function('data', 'figure', customJsFunction);
    const newFigure = userFunction(eventData, figure);

    return newFigure;
}

/**
 *
 * For a given event type executes if defined the Dara actions and custom js. It will also update the figure object based on the custom js function.
 *
 * @param eventType - the name of the event
 * @param eventData - the data from the event
 * @param eventActions - the actions to execute
 * @param figure - the plotly figure
 * @param setFigure - the function to update the figure
 */
function handleEvent<T extends PlotlyEventName>(
    eventType: T,
    eventData: Parameters<RequiredPlotParams[EventHandlersMap[T]]>[0],
    eventActions: Array<ActionEvent>,
    figure: any,
    setFigure: React.Dispatch<any>
): void {
    eventActions?.forEach((eventAction) => {
        if (eventAction?.handler) {
            const filteredData = filterEventData(figure, eventData, eventType);
            eventAction.handler(filteredData.points);
        }
        if (eventAction?.custom_js) {
            const newFigure = executeCustomJs(eventAction.custom_js, eventData, figure);
            setFigure(newFigure);
        }
    });
}

const StyledPlotly = injectCss('div');

/* eslint-disable no-underscore-dangle */
/**
 * A component for displaying Plotly graphs
 *
 * @param {PlotlyProps} props - the component props
 */
function Plotly(props: PlotlyProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [figure, setFigure] = useState(() => JSON.parse(props.figure));
    const eventActions = new Map<string, Array<ActionEvent>>();

    if (props.events) {
        props.events.forEach((event) => {
            const actions = new Array<ActionEvent>();
            event?.actions.forEach((action) => {
                // eslint-disable-next-line react-hooks/rules-of-hooks
                const [actionHandler] = useAction(action);
                actions.push({ custom_js: event.custom_js, handler: actionHandler });
            });
            const currentActions = eventActions.get(event.event_name) ?? [];
            eventActions.set(event.event_name, [...currentActions, ...actions]);
        });
    }

    // add an event handler for each Plot event, e.g. onClick, onHover, etc
    const eventHandlers = Object.keys(eventHandlersMap).reduce((acc, key: keyof EventHandlersMap) => {
        const eventHandlerName = eventHandlersMap[key];
        const eventHandler = (e: PlotlyEventData): void => {
            handleEvent(key, e, eventActions.get(key), figure, setFigure);
        };
        // we are casting to any here because there is an issue with union vs intersection of types
        acc[eventHandlerName] = eventHandler as any;
        return acc;
    }, {} as RequiredPlotParams);

    return (
        <StyledPlotly $rawCss={css} style={{ flex: '1 1 auto', minHeight: '350px', ...style }}>
            <AutoSizer>
                {({ height, width }) => (
                    <Plot
                        config={{ responsive: true }}
                        data={figure.data}
                        frames={figure.frames}
                        layout={figure.layout}
                        {...eventHandlers}
                        style={{ height, width }}
                        useResizeHandler
                    />
                )}
            </AutoSizer>
        </StyledPlotly>
    );
}

export default Plotly;
