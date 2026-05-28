from dara.components import Button, Card, Code, Heading, Stack
from dara.core import ComponentInstance, DownloadVariable, Variable

download_rows = Variable(
    [
        {
            'id': 'policy-001',
            'owner': 'Operations',
            'active': True,
            'score': 92,
            'reviewed_on': '2026-05-28',
        },
        {
            'id': 'policy-002',
            'owner': 'Analytics',
            'active': False,
            'score': 71,
            'reviewed_on': '2026-05-21',
        },
        {
            'id': 'policy-003',
            'owner': 'Platform',
            'active': True,
            'score': 88,
            'reviewed_on': '2026-05-15',
        },
    ]
)


def download_xlsx_page() -> ComponentInstance:
    return Stack(
        Heading('Download Variable XLSX QA'),
        Card(
            Stack(
                Code(
                    code="""[
  {"id": "policy-001", "owner": "Operations", "active": true, "score": 92, "reviewed_on": "2026-05-28"},
  {"id": "policy-002", "owner": "Analytics", "active": false, "score": 71, "reviewed_on": "2026-05-21"},
  {"id": "policy-003", "owner": "Platform", "active": true, "score": 88, "reviewed_on": "2026-05-15"}
]""",
                    language='json',
                ),
                Button(
                    'Download XLSX',
                    onclick=DownloadVariable(
                        variable=download_rows,
                        file_name='download-variable-json-rows',
                        type='xlsx',
                    ),
                ),
            ),
            title='JSON Variable',
        ),
    )
