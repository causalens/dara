from pathlib import Path

from dara.core.base_definitions import AssetManifest

AUTOJS_ASSETS = [
    './auto_js/react.development.js',
    './auto_js/react-dom.development.js',
    './auto_js/react-is.development.js',
    './auto_js/styled-components.min.js',
    './auto_js/react-query.development.js',
    './auto_js/dara.core.umd.cjs',
    './auto_js/dara.core.css',
]

COMMON_ASSETS = [
    # jquery is required for bokeh etc so is always included to be safe
    './common/jquery.min.js',
]

asset_manifest = AssetManifest(
    base_path=Path(__file__).parent.absolute().as_posix(),
    autojs_assets=AUTOJS_ASSETS,
    common_assets=COMMON_ASSETS,
    tag_order=[*COMMON_ASSETS, *AUTOJS_ASSETS],
    depends_on=[],
)
