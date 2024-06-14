import os
import tempfile


from dara.core.js_tooling.js_utils import BuildCache, BuildConfig, BuildMode


def test_statics_migration():
    # Temp output folder
    with tempfile.TemporaryDirectory() as tmpdir:
        # Two local static folders
        with tempfile.TemporaryDirectory(dir='./') as temp_static_dir:
            with tempfile.TemporaryDirectory(dir='./') as temp_static_dir_2:
                # Create test.txt within first static folder
                with open(os.path.join(temp_static_dir, 'test.txt'), 'w') as f:
                    f.write('test')

                # Create nested folder within second static folder with test2.txt
                os.makedirs(os.path.join(temp_static_dir_2, 'nested'))
                with open(os.path.join(temp_static_dir_2, 'nested', 'test2.txt'), 'w') as f:
                    f.write('test2')

                cache = BuildCache(
                    static_folders=[temp_static_dir, temp_static_dir_2],
                    static_files_dir=tmpdir,
                    package_map={},
                    build_config=BuildConfig(mode=BuildMode.PRODUCTION, dev=False),
                )
                cache.migrate_static_assets()

                # Check that files were moved to the correct location
                assert os.path.exists(os.path.join(tmpdir, 'test.txt'))
                assert os.path.exists(os.path.join(tmpdir, 'nested', 'test2.txt'))
