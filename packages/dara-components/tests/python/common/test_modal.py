import unittest
import uuid
from unittest.mock import patch

from dara.components.common import Modal
from dara.core.interactivity import ActionCtx, Variable, action

from tests.python.utils import MockComponent

test_uid = uuid.uuid4()


class TestModalComponent(unittest.TestCase):
    """Test the Modal component"""

    @patch('dara.core.definitions.uuid.uuid4', return_value=test_uid)
    def test_serialization(self, _uid):
        """Test the component serializes to a dict"""

        @action
        async def on_attempt_close(ctx: ActionCtx):
            print('Modal attempting to close')

        @action
        async def on_closed(ctx: ActionCtx):
            print('Modal closed')

        t1 = MockComponent(test_id='ModalText')
        show = Variable(default=False)
        cmp = Modal(
            t1,
            show=show,
            on_attempt_close=on_attempt_close(),
            on_closed=on_closed(),
        )

        expected_dict = {
            'name': 'Modal',
            'props': {
                'children': [t1.model_dump(exclude_none=True)],
                'position': 'relative',
                'show': show.model_dump(exclude_none=True),
                'on_attempt_close': on_attempt_close().model_dump(exclude_none=True),
                'on_closed': on_closed().model_dump(exclude_none=True),
            },
            'uid': str(test_uid),
        }
        self.assertDictEqual(cmp.model_dump(exclude_none=True), expected_dict)
