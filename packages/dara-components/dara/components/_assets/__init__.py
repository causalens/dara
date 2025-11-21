from pathlib import Path

from dara.core.base_definitions import AssetManifest

AUTOJS_ASSETS = [
    './auto_js/dara.components.umd.js',
    './auto_js/dara.components.css',
]

COMMON_ASSETS = []

asset_manifest = AssetManifest(
    base_path=Path(__file__).parent.absolute().as_posix(),
    autojs_assets=AUTOJS_ASSETS,
    common_assets=COMMON_ASSETS,
    tag_order=[*COMMON_ASSETS, *AUTOJS_ASSETS],
    depends_on=['dara.core'],
)
