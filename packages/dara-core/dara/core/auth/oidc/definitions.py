from pydantic import BaseModel, Field


class OIDCDiscoveryMetadata(BaseModel):
    """
    OpenID Provider Metadata as defined in OpenID Connect Discovery 1.0.
    https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
    """

    issuer: str = Field(
        ...,
        description='REQUIRED. URL using the https scheme with no query or fragment components that the OP asserts as its Issuer Identifier. If Issuer discovery is supported, this value MUST be identical to the issuer value returned by WebFinger. This also MUST be identical to the iss Claim value in ID Tokens issued from this Issuer.',
    )

    authorization_endpoint: str = Field(
        ...,
        description="REQUIRED. URL of the OP's OAuth 2.0 Authorization Endpoint. This URL MUST use the https scheme and MAY contain port, path, and query parameter components.",
    )

    token_endpoint: str | None = Field(
        default=None,
        description="URL of the OP's OAuth 2.0 Token Endpoint. This is REQUIRED unless only the Implicit Flow is used. This URL MUST use the https scheme and MAY contain port, path, and query parameter components.",
    )

    userinfo_endpoint: str | None = Field(
        default=None,
        description="RECOMMENDED. URL of the OP's UserInfo Endpoint. This URL MUST use the https scheme and MAY contain port, path, and query parameter components.",
    )

    jwks_uri: str = Field(
        ...,
        description="REQUIRED. URL of the OP's JWK Set document, which MUST use the https scheme. This contains the signing key(s) the RP uses to validate signatures from the OP. The JWK Set MAY also contain the Server's encryption key(s), which are used by RPs to encrypt requests to the Server.",
    )

    registration_endpoint: str | None = Field(
        default=None,
        description="RECOMMENDED. URL of the OP's Dynamic Client Registration Endpoint, which MUST use the https scheme.",
    )

    scopes_supported: list[str] | None = Field(
        default=None,
        description='RECOMMENDED. JSON array containing a list of the OAuth 2.0 scope values that this server supports. The server MUST support the openid scope value. Servers MAY choose not to advertise some supported scope values even when this parameter is used.',
    )

    response_types_supported: list[str] = Field(
        ...,
        description='REQUIRED. JSON array containing a list of the OAuth 2.0 response_type values that this OP supports. Dynamic OpenID Providers MUST support the code, id_token, and the id_token token Response Type values.',
    )

    response_modes_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the OAuth 2.0 response_mode values that this OP supports. If omitted, the default for Dynamic OpenID Providers is ["query", "fragment"].',
    )

    grant_types_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the OAuth 2.0 Grant Type values that this OP supports. Dynamic OpenID Providers MUST support the authorization_code and implicit Grant Type values and MAY support other Grant Types. If omitted, the default value is ["authorization_code", "implicit"].',
    )

    acr_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the Authentication Context Class References that this OP supports.',
    )

    subject_types_supported: list[str] = Field(
        ...,
        description='REQUIRED. JSON array containing a list of the Subject Identifier types that this OP supports. Valid types include pairwise and public.',
    )

    id_token_signing_alg_values_supported: list[str] = Field(
        ...,
        description='REQUIRED. JSON array containing a list of the JWS signing algorithms (alg values) supported by the OP for the ID Token to encode the Claims in a JWT. The algorithm RS256 MUST be included. The value none MAY be supported but MUST NOT be used unless the Response Type used returns no ID Token from the Authorization Endpoint.',
    )

    id_token_encryption_alg_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWE encryption algorithms (alg values) supported by the OP for the ID Token to encode the Claims in a JWT.',
    )

    id_token_encryption_enc_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWE encryption algorithms (enc values) supported by the OP for the ID Token to encode the Claims in a JWT.',
    )

    userinfo_signing_alg_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWS signing algorithms (alg values) supported by the UserInfo Endpoint to encode the Claims in a JWT. The value none MAY be included.',
    )

    userinfo_encryption_alg_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWE encryption algorithms (alg values) supported by the UserInfo Endpoint to encode the Claims in a JWT.',
    )

    userinfo_encryption_enc_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWE encryption algorithms (enc values) supported by the UserInfo Endpoint to encode the Claims in a JWT.',
    )

    request_object_signing_alg_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWS signing algorithms (alg values) supported by the OP for Request Objects. These algorithms are used both when the Request Object is passed by value (using the request parameter) and when it is passed by reference (using the request_uri parameter). Servers SHOULD support none and RS256.',
    )

    request_object_encryption_alg_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWE encryption algorithms (alg values) supported by the OP for Request Objects. These algorithms are used both when the Request Object is passed by value and when it is passed by reference.',
    )

    request_object_encryption_enc_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWE encryption algorithms (enc values) supported by the OP for Request Objects. These algorithms are used both when the Request Object is passed by value and when it is passed by reference.',
    )

    token_endpoint_auth_methods_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of Client Authentication methods supported by this Token Endpoint. The options are client_secret_post, client_secret_basic, client_secret_jwt, and private_key_jwt. Other authentication methods MAY be defined by extensions. If omitted, the default is client_secret_basic.',
    )

    token_endpoint_auth_signing_alg_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the JWS signing algorithms (alg values) supported by the Token Endpoint for the signature on the JWT used to authenticate the Client at the Token Endpoint for the private_key_jwt and client_secret_jwt authentication methods. Servers SHOULD support RS256. The value none MUST NOT be used.',
    )

    display_values_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the display parameter values that the OpenID Provider supports.',
    )

    claim_types_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. JSON array containing a list of the Claim Types that the OpenID Provider supports. Values defined by this specification are normal, aggregated, and distributed. If omitted, the implementation supports only normal Claims.',
    )

    claims_supported: list[str] | None = Field(
        default=None,
        description='RECOMMENDED. JSON array containing a list of the Claim Names of the Claims that the OpenID Provider MAY be able to supply values for. Note that for privacy or other reasons, this might not be an exhaustive list.',
    )

    service_documentation: str | None = Field(
        default=None,
        description='OPTIONAL. URL of a page containing human-readable information that developers might want or need to know when using the OpenID Provider. In particular, if the OpenID Provider does not support Dynamic Client Registration, then information on how to register Clients needs to be provided in this documentation.',
    )

    claims_locales_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. Languages and scripts supported for values in Claims being returned, represented as a JSON array of BCP47 language tag values. Not all languages and scripts are necessarily supported for all Claim values.',
    )

    ui_locales_supported: list[str] | None = Field(
        default=None,
        description='OPTIONAL. Languages and scripts supported for the user interface, represented as a JSON array of BCP47 language tag values.',
    )

    claims_parameter_supported: bool | None = Field(
        default=None,
        description='OPTIONAL. Boolean value specifying whether the OP supports use of the claims parameter, with true indicating support. If omitted, the default value is false.',
    )

    request_parameter_supported: bool | None = Field(
        default=None,
        description='OPTIONAL. Boolean value specifying whether the OP supports use of the request parameter, with true indicating support. If omitted, the default value is false.',
    )

    request_uri_parameter_supported: bool | None = Field(
        default=None,
        description='OPTIONAL. Boolean value specifying whether the OP supports use of the request_uri parameter, with true indicating support. If omitted, the default value is true.',
    )

    require_request_uri_registration: bool | None = Field(
        default=None,
        description='OPTIONAL. Boolean value specifying whether the OP requires any request_uri values used to be pre-registered using the request_uris registration parameter. Pre-registration is REQUIRED when the value is true. If omitted, the default value is false.',
    )

    op_policy_uri: str | None = Field(
        default=None,
        description="OPTIONAL. URL that the OpenID Provider provides to the person registering the Client to read about the OP's requirements on how the Relying Party can use the data provided by the OP. The registration process SHOULD display this URL to the person registering the Client if it is given.",
    )

    op_tos_uri: str | None = Field(
        default=None,
        description="OPTIONAL. URL that the OpenID Provider provides to the person registering the Client to read about the OpenID Provider's terms of service. The registration process SHOULD display this URL to the person registering the Client if it is given.",
    )

    class Config:
        extra = 'allow'  # Allow additional fields as per spec: "Additional OpenID Provider Metadata parameters MAY also be used"
