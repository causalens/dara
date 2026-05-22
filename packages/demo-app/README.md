# Demo App



## How to run the app

To run the application you can use the following command:

```bash
poetry run dara start
```

For development purposes it is often useful to add the `--reload` flag which will automatically reload the application when changes are made to any of the Python files.

By default this will load the config from the `config` variable in `./demo_app/main.py` module.
The default demo app runs without OIDC authentication. Local OIDC QA is opt-in via the helper scripts below.
To see the list of available config options you can use the `--help` flag:

```bash
poetry run dara start --help
```

To see other available commands you can run:

```bash
poetry run dara
```

## Local OIDC QA

Start the controllable provider from the repository root:

```bash
cd tools/local-oidc-provider
npm install --no-package-lock
npm start
```

In a second shell, source the demo-app env helper before starting the app. This sets `DARA_DEMO_AUTH=oidc` and the required `SSO_*` variables for the local provider:

```bash
cd packages/demo-app
source scripts/use-local-oidc.sh
poetry run dara start --reload
```

For fish:

```fish
cd packages/demo-app
source scripts/use-local-oidc.fish
poetry run dara start --reload
```

Use `--userinfo` with either helper to enable `SSO_USE_USERINFO=true`.
