import logging
from dara.core.logging import DaraDevFormatter
from colorama import Back, Fore


def test_custom_level():
    HIGHER_INFO = int((logging.INFO + logging.WARNING) / 2)
    logging.addLevelName(HIGHER_INFO, 'HIGHER_INFO')
    HIGHER_WARNING = int((logging.WARNING + logging.ERROR) / 2)
    logging.addLevelName(HIGHER_WARNING, 'HIGHER_WARNING')

    formatter = DaraDevFormatter()

    logger = logging.getLogger('test_logger')
    fn, lno, func, sinfo = logger.findCaller()
    args, exc_info, extra = (), None, None
    msg = 'Sample message'

    record = logger.makeRecord(logger.name, HIGHER_INFO, fn, lno, msg, args, exc_info, func, extra, sinfo)
    colors = formatter._resolve_record_color(record)
    assert colors == (Back.GREEN, Fore.GREEN)

    record = logger.makeRecord(logger.name, HIGHER_WARNING, fn, lno, msg, args, exc_info, func, extra, sinfo)
    colors = formatter._resolve_record_color(record)
    assert colors == (Back.YELLOW, Fore.YELLOW)

    record = logger.makeRecord(logger.name, logging.DEBUG, fn, lno, msg, args, exc_info, func, extra, sinfo)
    colors = formatter._resolve_record_color(record)
    assert colors == (Back.WHITE, Fore.RESET)
