---
title: Authentication
---

The aim of this document is to show you how to configure authentication in a Dara app. Authentication controls who can access your application and provides user identity information to your app's backend code.

## Overview

Dara provides a pluggable authentication system that allows you to choose the right authentication strategy for your use case. The framework ships with several built-in authentication configurations:

-   **DefaultAuthConfig**: No-authentication mode for local development (default)
-   **BasicAuthConfig**: Single username/password authentication
-   **MultiBasicAuthConfig**: Multiple username/password authentication
-   **OIDCAuthConfig**: OpenID Connect (SSO) authentication for enterprise environments

All authentication configurations are set using the `add_auth` method on the `ConfigurationBuilder`:

```python
from dara.core import ConfigurationBuilder
from dara.core.auth import BasicAuthConfig

config = ConfigurationBuilder()
config.add_auth(BasicAuthConfig(username='admin', password='secret'))
```

## Default Authentication

The `DefaultAuthConfig` is the default authentication mode when no authentication is explicitly configured. It is useful for local development as it automatically generates a session token without requiring any credentials.

```python
from dara.core import ConfigurationBuilder
from dara.core.auth import DefaultAuthConfig

config = ConfigurationBuilder()
config.add_auth(DefaultAuthConfig())
```

In this mode, a single "user" identity is created for all sessions. The login screen auto-submits without user input, providing a seamless development experience.

## Basic Authentication

For simple authentication needs, Dara provides two basic authentication configurations.

### Single User

The `BasicAuthConfig` allows you to authenticate with a single username and password:

```python
from dara.core import ConfigurationBuilder
from dara.core.auth import BasicAuthConfig

config = ConfigurationBuilder()
config.add_auth(BasicAuthConfig(username='admin', password='secret'))
```

### Multiple Users

The `MultiBasicAuthConfig` allows you to authenticate with multiple username/password combinations:

```python
from dara.core import ConfigurationBuilder
from dara.core.auth import MultiBasicAuthConfig

config = ConfigurationBuilder()
config.add_auth(MultiBasicAuthConfig(users={
    'alice': 'password1',
    'bob': 'password2',
    'charlie': 'password3'
}))
```

Both configurations present a login form where users enter their credentials. Upon successful authentication, a JWT token is issued and used for subsequent requests.

## OIDC Authentication

For enterprise environments, Dara supports OpenID Connect (OIDC) authentication, which allows integration with identity providers like Okta, Auth0, Azure AD, or any OIDC-compliant provider.

```python
from dara.core import ConfigurationBuilder
from dara.core.auth import OIDCAuthConfig

config = ConfigurationBuilder()
config.add_auth(OIDCAuthConfig())
```

The `OIDCAuthConfig` reads its configuration from environment variables. The following environment variables are required:

| Variable            | Description                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `SSO_ISSUER_URL`    | `https://login.causalens.com/api/authentication` | URL of the OIDC identity provider issuer                   |
| `SSO_CLIENT_ID`     | OAuth 2.0 client ID provided by your identity provider                                                        |
| `SSO_CLIENT_ID`     | OAuth 2.0 client ID provided by your identity provider                                                        |
| `SSO_CLIENT_SECRET` | OAuth 2.0 client secret provided by your identity provider                                                    |
| `SSO_REDIRECT_URI`  | URL the identity provider should redirect to after authentication (e.g., `https://your-app.com/sso-callback`) |
| `SSO_GROUPS`        | Comma-separated list of allowed groups for access control                                                     |

The following environment variables are optional:

| Variable                  | Default                                          | Description                                                          |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `SSO_JWT_ALGO`            | `ES256`                                          | Algorithm for verifying identity provider JWTs                       |
| `SSO_SCOPES`              | `openid`                                         | Space-separated list of OAuth scopes to request                      |
| `SSO_VERIFY_AUDIENCE`     | `False`                                          | Whether to verify the `aud` claim in ID tokens                       |
| `SSO_EXTRA_AUDIENCE`      | `None`                                           | Additional audiences to verify against (defaults to `SSO_CLIENT_ID`) |
| `SSO_ALLOWED_IDENTITY_ID` | `None`                                           | If set, restricts access to a specific identity ID                   |

### OIDC Authentication Flow

When using OIDC authentication, the following flow occurs:

1. The user clicks the login button
2. The app redirects the user to the identity provider's authorization endpoint
3. The user authenticates with the identity provider
4. The identity provider redirects back to your app's callback URL with an authorization code
5. The app exchanges the authorization code for tokens
6. The app verifies the ID token and checks group membership
7. A Dara session token is issued to the user

### Audience Override

In some scenarios, you may need to use different client credentials for audience verification. You can set the following environment variables to override the client credentials used for audience verification:

| Variable                     | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| `SSO_AUDIENCE_CLIENT_ID`     | Overrides `SSO_CLIENT_ID` for audience verification |
| `SSO_AUDIENCE_CLIENT_SECRET` | Corresponding secret for the audience override      |

When both variables are set and `SSO_VERIFY_AUDIENCE` is not explicitly set to `False`, audience verification is automatically enabled.

## Accessing User Data

Within authenticated contexts such as `@action` handlers, `DerivedVariable` functions, and `@py_component` decorated components, you can access the current user's information.

### Using `get_user_data()`

The recommended way to access user data is through the `get_user_data()` helper function:

```python
from dara.core.auth.utils import get_user_data

@py_component
def user_greeting():
    user = get_user_data()
    if user is not None:
        return Text(f'Welcome, {user.identity_name}!')
    return Text('Welcome, guest!')
```

The `get_user_data()` function returns a `UserData` object with the following fields:

| Field            | Type       | Description                    |
| ---------------- | ---------- | ------------------------------ | ---------------------------------------- |
| `identity_id`    | `str`      | Unique identifier for the user |
| `identity_name`  | `str`      | Display name of the user       |
| `identity_email` | `str | None` | Email address of the user (if available) |
| `groups`         | `list[str] | None`  | List of groups the user belongs to |

### Using Context Variables Directly

You can also access authentication context variables directly for more fine-grained control:

```python
from dara.core.auth.definitions import USER, SESSION_ID

@py_component
def session_info():
    user = USER.get()
    session_id = SESSION_ID.get()

    if user is not None:
        return Text(f'User: {user.identity_name}, Session: {session_id}')
    return Text('Not authenticated')
```

The following context variables are available:

| Variable     | Type                 | Description |
| ------------ | -------------------- | ----------- | -------------------------------------------- |
| `USER`       | `ContextVar[UserData | None]`      | Current user data                            |
| `SESSION_ID` | `ContextVar[str      | None]`      | Current session ID                           |
| `ID_TOKEN`   | `ContextVar[str      | None]`      | Raw ID token (only set when using OIDC auth) |

:::caution

User data is only available within authenticated contexts where Dara can determine the currently logged-in user. This includes:

-   `DerivedVariable` resolver functions
-   Action handlers (functions decorated with `@action`)
-   `@py_component` decorated functions

Attempting to access user data outside of these contexts will return `None` and log a warning.

:::

### Accessing User Data in Custom Endpoints

If you have [custom endpoints](./custom-endpoints.md) that are authenticated, you can access user data in the same way:

```python
from dara.core.auth.definitions import USER, SESSION_ID
from dara.core.http import get

@get('/user-info')
def user_info_handler():
    user = USER.get()
    session_id = SESSION_ID.get()

    if user is None:
        return {'error': 'Not authenticated'}

    return {
        'identity_id': user.identity_id,
        'identity_name': user.identity_name,
        'identity_email': user.identity_email,
        'groups': user.groups,
        'session_id': session_id
    }
```

## Custom Authentication

If the built-in authentication configurations do not meet your needs, you can create a custom authentication configuration by extending the `BaseAuthConfig` class. This allows you to implement your own authentication logic while integrating with the Dara framework.
Refer to the existing authentication configurations in `dara.core.auth` for examples of how to implement custom authentication.
