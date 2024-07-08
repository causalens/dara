import { CausalGraph, EdgeType, VariableType } from '../../src/types';

export const SIMPLE: CausalGraph = {
    edges: {
        A: {
            B: {
                destination: {
                    identifier: 'B',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'A',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        B: {
            C: {
                destination: {
                    identifier: 'C',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'B',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            D: {
                destination: {
                    identifier: 'D',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'B',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
    },
    nodes: {
        A: {
            identifier: 'A',
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        B: {
            identifier: 'B',
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        C: {
            identifier: 'C',
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        D: {
            identifier: 'D',
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
    },
    version: '2',
};

export const FRAUD: CausalGraph = {
    edges: {
        Age: {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Age',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            'Marital Status Value=Married': {
                destination: {
                    identifier: 'Marital Status Value=Married',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Age',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            'Number of Children': {
                destination: {
                    identifier: 'Number of Children',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Age',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Authority Contacted': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Authority Contacted',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        CPI: {
            Salary: {
                destination: {
                    identifier: 'Salary',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'CPI',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Car Value': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Car Value',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Claim Type Value=Liability': {
            'Total Claim': {
                destination: {
                    identifier: 'Total Claim',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Claim Type Value=Liability',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Collision Type Value=Front': {
            'Claim Type Value=Liability': {
                destination: {
                    identifier: 'Claim Type Value=Liability',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Collision Type Value=Front',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            'Total Claim': {
                destination: {
                    identifier: 'Total Claim',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Collision Type Value=Front',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Crime Rate': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Crime Rate',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Education Level Value=Higher': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Education Level Value=Higher',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            'Occupation Value=Professional': {
                destination: {
                    identifier: 'Occupation Value=Professional',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Education Level Value=Higher',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Gender Value=F': {
            Salary: {
                destination: {
                    identifier: 'Salary',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Gender Value=F',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Location Value=EC': {
            'Crime Rate': {
                destination: {
                    identifier: 'Crime Rate',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Location Value=EC',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Location Value=SE': {
            'Crime Rate': {
                destination: {
                    identifier: 'Crime Rate',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Location Value=SE',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Location Value=SW': {
            'Crime Rate': {
                destination: {
                    identifier: 'Crime Rate',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Location Value=SW',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Marital Status Value=Married': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Marital Status Value=Married',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'No-Claims Years': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'No-Claims Years',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Number of Children': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Number of Children',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Occupation Value=Professional': {
            Salary: {
                destination: {
                    identifier: 'Salary',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Occupation Value=Professional',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Previous Claims': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Previous Claims',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Previous Claims Value': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Previous Claims Value',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        Salary: {
            'Car Value': {
                destination: {
                    identifier: 'Car Value',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Salary',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Salary',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Total Claim': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Total Claim',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Unemployment Rate': {
            Salary: {
                destination: {
                    identifier: 'Salary',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Unemployment Rate',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        'Years with License': {
            Fraud: {
                destination: {
                    identifier: 'Fraud',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'Years with License',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
    },
    nodes: {
        Age: {
            identifier: 'Age',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Authority Contacted': {
            identifier: 'Authority Contacted',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        CPI: {
            identifier: 'CPI',
            meta: { group: 'a' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Car Value': {
            identifier: 'Car Value',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Claim Type Value=Liability': {
            identifier: 'Claim Type Value=Liability',
            meta: { group: 'c' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Collision Type Value=Front': {
            identifier: 'Collision Type Value=Front',
            meta: { group: 'c' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Crime Rate': {
            identifier: 'Crime Rate',
            meta: { group: 'b' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Education Level Value=Higher': {
            identifier: 'Education Level Value=Higher',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        Fraud: {
            identifier: 'Fraud',
            meta: { group: 'e' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Gender Value=F': {
            identifier: 'Gender Value=F',
            meta: { group: 'a' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Location Value=EC': {
            identifier: 'Location Value=EC',
            meta: { group: 'a', order: 1 },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Location Value=SE': {
            identifier: 'Location Value=SE',
            meta: { group: 'a', order: 2 },

            variable_type: VariableType.UNSPECIFIED,
        },
        'Location Value=SW': {
            identifier: 'Location Value=SW',
            meta: { group: 'a', order: 3 },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Marital Status Value=Married': {
            identifier: 'Marital Status Value=Married',
            meta: { group: 'c' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'No-Claims Years': {
            identifier: 'No-Claims Years',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Number of Children': {
            identifier: 'Number of Children',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Occupation Value=Professional': {
            identifier: 'Occupation Value=Professional',
            meta: { group: 'c' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Previous Claims': {
            identifier: 'Previous Claims',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Previous Claims Value': {
            identifier: 'Previous Claims Value',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        Salary: {
            identifier: 'Salary',
            meta: { group: 'b' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Total Claim': {
            identifier: 'Total Claim',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Unemployment Rate': {
            identifier: 'Unemployment Rate',
            meta: { group: 'a' },
            variable_type: VariableType.UNSPECIFIED,
        },
        'Years with License': {
            identifier: 'Years with License',
            meta: { group: 'd' },
            variable_type: VariableType.UNSPECIFIED,
        },
    },
    version: '2',
};

export const SHIPPED_UNITS: CausalGraph = {
    edges: {
        'amg click throughs': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'neo paid impressions search': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'amg cost calc combined': {
            'amg click throughs': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'amg impr combined': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'amg impr combined': {
            'amg click throughs': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'ams ams clicks': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'ams ams spend': {
            'ams ams clicks': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'ams sumimpressions': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'ams sumimpressions': {
            'ams ams clicks': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'ara traffic out of stock views': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'ara traffic glance views': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'ara traffic in stock %': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'ara traffic out of stock views': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'rnr avg star rating': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'ara traffic out of stock views': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'ara traffic prime shipping views': {
            'ams ams clicks': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'ara traffic glance views': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'fb combined click': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'fb combined impressions': {
            'fb combined click': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'fb combined spend': {
            'fb combined click': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'fb combined impressions': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'neo org branded clicks': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'neo org branded impressions': {
            'neo org branded clicks': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'neo org unbranded impressions': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'neo org unbranded clicks': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'neo org unbranded impressions': {
            'neo org unbranded clicks': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'rnr avg star rating': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'neo paid clicks search': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'neo org unbranded clicks': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'sos paid pd wtd impressions': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'neo paid impressions search': {
            'neo paid clicks search': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'neo paid neo ps cost': {
            'neo paid clicks search': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'neo paid impressions search': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'rnr avg star rating': {
            'amg impr combined': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'rnr total number of reviews': {
            'ams ams clicks': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'ams sumimpressions': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'sos org org wtd impressions': {
            'ara rev shipped units acfu,7': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
            'neo org branded clicks': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'sos org sos org avg rank': {
            'sos org org wtd impressions': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
        'sos paid pd wtd impressions': {
            'sos org org wtd impressions': {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
            },
        },
    },
    nodes: {
        'amg click throughs': {
            meta: {},
        },
        'amg cost calc combined': {
            meta: {},
        },
        'amg impr combined': {
            meta: {},
        },
        'ams ams clicks': {
            meta: {},
        },
        'ams ams spend': {
            meta: {},
        },
        'ams sumimpressions': {
            meta: {},
        },
        'ara rev shipped units acfu,7': {
            meta: {},
        },
        'ara traffic glance views': {
            meta: {},
        },
        'ara traffic in stock %': {
            meta: {},
        },
        'ara traffic out of stock views': {
            meta: {},
        },
        'ara traffic prime shipping views': {
            meta: {},
        },
        'fb combined click': {
            meta: {},
        },
        'fb combined impressions': {
            meta: {},
        },
        'fb combined spend': {
            meta: {},
        },
        'neo org branded clicks': {
            meta: {},
        },
        'neo org branded impressions': {
            meta: {},
        },
        'neo org unbranded clicks': {
            meta: {},
        },
        'neo org unbranded impressions': {
            meta: {},
        },
        'neo paid clicks search': {
            meta: {},
        },
        'neo paid impressions search': {
            meta: {},
        },
        'neo paid neo ps cost': {
            meta: {},
        },
        'rnr avg star rating': {
            meta: {},
        },
        'rnr total number of reviews': {
            meta: {},
        },
        'sos org org wtd impressions': {
            meta: {},
        },
        'sos org sos org avg rank': {
            meta: {},
        },
        'sos paid pd wtd impressions': {
            meta: {},
        },
    },
    version: '0.1.10',
};
