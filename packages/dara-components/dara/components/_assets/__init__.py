from pathlib import Path

from dara.core.base_definitions import AssetManifest, StaticAsset

asset_manifest = AssetManifest(
    base_path=Path(__file__).parent,
    static_assets=[StaticAsset(source='common', target='.')],
)
