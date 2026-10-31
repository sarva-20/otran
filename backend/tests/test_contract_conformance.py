from pathlib import Path
from typing import Any

import yaml
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import AnalysisStats, Battlecard, Change, ChatRequest, Gap


ROOT = Path(__file__).parents[2]


def _resolve(schema: Any, components: dict[str, Any]) -> Any:
    if isinstance(schema, dict) and "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[-1]
        return components[name]
    return schema


def _nullable(schema: dict[str, Any]) -> bool:
    if schema.get("nullable") is True:
        return True
    return any(
        isinstance(option, dict) and option.get("type") == "null"
        for option in schema.get("anyOf", [])
    )


def _type(schema: dict[str, Any]) -> Any:
    if schema.get("type") is not None:
        return schema["type"]
    for option in schema.get("anyOf", []):
        if isinstance(option, dict) and option.get("type") != "null":
            return option.get("type")
    return None


def _schema_differences(
    name: str,
    contract: dict[str, Any],
    generated: dict[str, Any],
    contract_components: dict[str, Any],
    generated_components: dict[str, Any],
) -> list[str]:
    contract = _resolve(contract, contract_components)
    generated = _resolve(generated, generated_components)
    differences: list[str] = []

    if contract.get("type") != _type(generated):
        differences.append(f"{name}: type {_type(generated)!r} != {contract.get('type')!r}")
    if contract.get("enum") != generated.get("enum"):
        differences.append(f"{name}: enum {generated.get('enum')!r} != {contract.get('enum')!r}")
    if _nullable(contract) != _nullable(generated):
        differences.append(f"{name}: nullable {_nullable(generated)} != {_nullable(contract)}")

    contract_required = set(contract.get("required", []))
    generated_required = set(generated.get("required", []))
    if contract_required != generated_required:
        differences.append(
            f"{name}: required {sorted(generated_required)!r} != {sorted(contract_required)!r}"
        )

    contract_properties = contract.get("properties", {})
    generated_properties = generated.get("properties", {})
    if set(contract_properties) != set(generated_properties):
        differences.append(
            f"{name}: properties {sorted(generated_properties)!r} != "
            f"{sorted(contract_properties)!r}"
        )
    for property_name in sorted(set(contract_properties) & set(generated_properties)):
        differences.extend(
            _schema_differences(
                f"{name}.{property_name}",
                contract_properties[property_name],
                generated_properties[property_name],
                contract_components,
                generated_components,
            )
        )
    return differences


def test_openapi_matches_contract() -> None:
    contract = yaml.safe_load((ROOT / "contracts" / "openapi.yaml").read_text())
    with TestClient(app) as client:
        generated = client.get("/openapi.json").json()

    differences: list[str] = []
    contract_paths = set(contract["paths"])
    generated_paths = set(generated["paths"])
    if contract_paths != generated_paths:
        differences.append(
            f"paths: {sorted(generated_paths)!r} != {sorted(contract_paths)!r}"
        )

    contract_components = contract["components"]["schemas"]
    generated_components = generated["components"]["schemas"]
    for schema_name, contract_schema in contract_components.items():
        generated_schema = generated_components.get(schema_name)
        if generated_schema is None:
            differences.append(f"components.schemas.{schema_name}: missing")
            continue
        differences.extend(
            _schema_differences(
                f"components.schemas.{schema_name}",
                contract_schema,
                generated_schema,
                contract_components,
                generated_components,
            )
        )

    assert not differences, "OpenAPI contract differences:\n" + "\n".join(differences)


def test_non_nullable_collection_defaults() -> None:
    assert AnalysisStats().model_dump() == {
        "sources_collected": 0,
        "claims_total": 0,
        "claims_verified": 0,
        "claims_contradicted": 0,
        "changes_detected": 0,
    }
    assert ChatRequest(question="status").history == []
    assert Battlecard(competitor_id="p_1").claim_ids == []
    assert Gap(dimension="pricing", description="missing", severity="high").claim_ids == []
    assert Change(
        id="c_1",
        product_id="p_1",
        dimension="pricing",
        change_type="added",
        severity="high",
        summary="new",
        detected_at="2026-01-01T00:00:00Z",
    ).claim_ids == []


def test_localhost_ports_are_allowed_by_cors() -> None:
    origin = "http://127.0.0.1:49152"
    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
