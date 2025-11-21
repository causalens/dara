from pathlib import Path

from dara.core.base_definitions import AssetManifest

AUTOJS_ASSETS = [
    './auto_js/dara.components.umd.js',
    './auto_js/dara.components.css',
]

COMMON_ASSETS = [
    './common/bokeh-3.1.1.min.js',
    './common/bokeh-api-3.1.1.min.js',
    './common/bokeh-gl-3.1.1.min.js',
    './common/bokeh-mathjax-3.1.1.min.js',
    './common/bokeh-tables-3.1.1.min.js',
    './common/bokeh-widgets-3.1.1.min.js',
    './common/pixi.min.js',
    './common/pixi_viewport.js',
    './common/pixi-filters.min.js',
    './common/plotly.min.js',
]

asset_manifest = AssetManifest(
    base_path=Path(__file__).parent.absolute().as_posix(),
    autojs_assets=AUTOJS_ASSETS,
    common_assets=COMMON_ASSETS,
    # NOTE: explicitly excludes bokeh/pixi/plotly, they are loaded dynamically
    tag_order=AUTOJS_ASSETS,
    depends_on=['dara.core'],
)
