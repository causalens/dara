from dara.core.base_definitions import AssetManifest

CDN_ASSETS = [
    './cdn/jquery.min.js',
    './cdn/react.development.js'
    './cdn/react-dom.development.js'
    './cdn/react-is.development.js'
    './cdn/styled-components.min.js'
    './cdn/react-query.development.js'
]

asset_manifest = AssetManifest(
    autojs_assets=['./autojs/dara.core.umd.js', './autojs/dara.core.css'],
    # in this case all cdn assets should have tags so tag_order==assets
    cdn_assets=CDN_ASSETS,
    cdn_tag_order=CDN_ASSETS,
)
