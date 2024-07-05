export const MockCausalGraphWithExtras = {
    defaults: { edge_activation: null, node_activation: null, node_redacted: null },
    edges: {
        A: {
            B: {
                destination: { erased: null, identifier: 'B', meta: {}, redacted: null, variable_type: 'unspecified' },
                edge_type: '->',
                erased: ['piecewise_linear', 'piecewise_linear_decreasing'],
                meta: {},
                source: { erased: null, identifier: 'A', meta: {}, redacted: null, variable_type: 'unspecified' },
            },
        },
        B: {
            C: {
                destination: { erased: null, identifier: 'C', meta: {}, redacted: null, variable_type: 'unspecified' },
                edge_type: '->',
                erased: ['linear'],
                meta: {},
                source: { erased: null, identifier: 'B', meta: {}, redacted: null, variable_type: 'unspecified' },
            },
        },
    },
    nodes: {
        A: { erased: null, identifier: 'A', meta: {}, redacted: null, variable_type: 'unspecified' },
        B: { erased: null, identifier: 'B', meta: {}, redacted: null, variable_type: 'unspecified' },
        C: { erased: null, identifier: 'C', meta: {}, redacted: null, variable_type: 'unspecified' },
        D: { erased: null, identifier: 'D', meta: {}, redacted: 'sum', variable_type: 'unspecified' },
    },
    version: '0.8.0',
};

export const MockTimeSeriesCausalGraph = {
    edges: {
        X1: {
            X3: {
                destination: {
                    identifier: 'X3',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X3',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X3',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X1',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
            },
        },
        'X1 lag(n=1)': {
            X1: {
                destination: {
                    identifier: 'X1',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X1 lag(n=1)',
                    meta: {
                        time_lag: -1,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: -1,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
            },
        },
        'X1 lag(n=2)': {
            X1: {
                destination: {
                    identifier: 'X1',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X1 lag(n=2)',
                    meta: {
                        time_lag: -2,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: -2,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
            },
        },
        X2: {
            X3: {
                destination: {
                    identifier: 'X3',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X3',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X3',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X2',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X2',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X2',
                    variable_type: 'unspecified',
                },
            },
        },
        'X2 lag(n=1)': {
            X2: {
                destination: {
                    identifier: 'X2',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X2',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X2',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X2 lag(n=1)',
                    meta: {
                        time_lag: -1,
                        variable_name: 'X2',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: -1,
                    variable_name: 'X2',
                    variable_type: 'unspecified',
                },
            },
        },
    },
    nodes: {
        X1: {
            identifier: 'X1',
            meta: {
                time_lag: 0,
                variable_name: 'X1',
            },
            node_class: 'TimeSeriesNode',
            time_lag: 0,
            variable_name: 'X1',
            variable_type: 'unspecified',
        },
        'X1 lag(n=1)': {
            identifier: 'X1 lag(n=1)',
            meta: {
                time_lag: -1,
                variable_name: 'X1',
            },
            node_class: 'TimeSeriesNode',
            time_lag: -1,
            variable_name: 'X1',
            variable_type: 'unspecified',
        },
        'X1 lag(n=2)': {
            identifier: 'X1 lag(n=2)',
            meta: {
                time_lag: -2,
                variable_name: 'X1',
            },
            node_class: 'TimeSeriesNode',
            time_lag: -2,
            variable_name: 'X1',
            variable_type: 'unspecified',
        },
        X2: {
            identifier: 'X2',
            meta: {
                time_lag: 0,
                variable_name: 'X2',
            },
            node_class: 'TimeSeriesNode',
            time_lag: 0,
            variable_name: 'X2',
            variable_type: 'unspecified',
        },
        'X2 lag(n=1)': {
            identifier: 'X2 lag(n=1)',
            meta: {
                time_lag: -1,
                variable_name: 'X2',
            },
            node_class: 'TimeSeriesNode',
            time_lag: -1,
            variable_name: 'X2',
            variable_type: 'unspecified',
        },
        X3: {
            identifier: 'X3',
            meta: {
                time_lag: 0,
                variable_name: 'X3',
            },
            node_class: 'TimeSeriesNode',
            time_lag: 0,
            variable_name: 'X3',
            variable_type: 'unspecified',
        },
    },
    version: '0.3.14',
};
