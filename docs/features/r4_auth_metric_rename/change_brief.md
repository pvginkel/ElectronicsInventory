# R4: Rename `EI_` Metric Prefix on Auth Services

## Change Description

Rename the Electronics Inventory-specific `EI_` prefix from all Prometheus metric constants in the auth services (`auth_service.py` and `oidc_client_service.py`) to make them generic for Copier template extraction.

The five metrics to rename:

| Current Name | New Name |
|---|---|
| `EI_AUTH_VALIDATION_TOTAL` | `AUTH_VALIDATION_TOTAL` |
| `EI_AUTH_VALIDATION_DURATION_SECONDS` | `AUTH_VALIDATION_DURATION_SECONDS` |
| `EI_JWKS_REFRESH_TOTAL` | `JWKS_REFRESH_TOTAL` |
| `EI_OIDC_TOKEN_EXCHANGE_TOTAL` | `OIDC_TOKEN_EXCHANGE_TOTAL` |
| `EI_AUTH_TOKEN_REFRESH_TOTAL` | `AUTH_TOKEN_REFRESH_TOTAL` |

Both the Python constant names and the Prometheus metric string names (the first argument to `Counter`/`Histogram`) must be updated. All references in tests and documentation must also be updated.
