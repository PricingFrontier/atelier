"""Schema validation edge-case tests — Pydantic models from atelier.schemas."""

import pytest
from pydantic import ValidationError

from atelier.schemas import (
    ColumnValuesRequest,
    CreateProjectRequest,
    ExploreRequest,
    FitRequest,
    ModelDetail,
    ModelSaveRequest,
    ModelSummary,
    ProjectConfig,
    ProjectDetail,
    ProjectSummary,
    UpdateProjectConfigRequest,
    ValidateIssue,
    ValidateRequest,
    ValidateResponse,
)
from atelier.schemas.model_save import SplitMetrics, VersionChange
from atelier.schemas.model_spec import SplitSpec, TermSpec


# ===========================================================================
# TermSpec
# ===========================================================================

class TestTermSpec:
    def test_minimal_valid(self):
        t = TermSpec(column="Region", type="categorical")
        assert t.column == "Region"
        assert t.type == "categorical"
        assert t.df is None
        assert t.k is None
        assert t.monotonicity is None
        assert t.expr is None

    def test_all_fields(self):
        t = TermSpec(
            column="DrivAge", type="ns", df=5, k=10,
            monotonicity="increasing", expr="log(DrivAge)",
        )
        assert t.df == 5
        assert t.k == 10
        assert t.monotonicity == "increasing"
        assert t.expr == "log(DrivAge)"

    def test_missing_column_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            TermSpec(type="categorical")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("column",) for e in errors)

    def test_missing_type_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            TermSpec(column="Region")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("type",) for e in errors)

    def test_empty_column_is_valid(self):
        """Pydantic allows empty strings — validation is at the API layer."""
        t = TermSpec(column="", type="categorical")
        assert t.column == ""

    def test_invalid_type_rejected(self):
        """TermSpec type is restricted to known term types."""
        with pytest.raises(ValidationError):
            TermSpec(column="x", type="totally_invalid_type")

    def test_all_valid_term_types_accepted(self):
        """All known term types are accepted."""
        for tt in ("categorical", "target_encoding", "frequency_encoding", "linear", "bs", "ns", "expression"):
            t = TermSpec(column="x", type=tt, expr="x+1" if tt == "expression" else None)
            assert t.type == tt

    def test_df_zero(self):
        t = TermSpec(column="x", type="ns", df=0)
        assert t.df == 0

    def test_df_negative(self):
        """Negative df is accepted by Pydantic — validation is at the API layer."""
        t = TermSpec(column="x", type="ns", df=-1)
        assert t.df == -1

    def test_k_zero(self):
        t = TermSpec(column="x", type="bs", k=0)
        assert t.k == 0


# ===========================================================================
# SplitSpec
# ===========================================================================

class TestSplitSpec:
    def test_minimal_valid(self):
        s = SplitSpec(column="Group", mapping={"1": "train", "2": "validation"})
        assert s.column == "Group"
        assert s.mapping == {"1": "train", "2": "validation"}

    def test_null_values_in_mapping(self):
        s = SplitSpec(column="Group", mapping={"1": "train", "2": None})
        assert s.mapping["2"] is None

    def test_missing_column_raises(self):
        with pytest.raises(ValidationError):
            SplitSpec(mapping={"1": "train"})

    def test_missing_mapping_raises(self):
        with pytest.raises(ValidationError):
            SplitSpec(column="Group")

    def test_empty_mapping_valid(self):
        s = SplitSpec(column="Group", mapping={})
        assert s.mapping == {}

    def test_mapping_rejects_invalid_values(self):
        """Mapping values are restricted to train/validation/holdout/None."""
        with pytest.raises(ValidationError):
            SplitSpec(column="Group", mapping={"1": "custom_split_name"})

    def test_mapping_accepts_valid_values(self):
        """Mapping accepts train, validation, holdout, and None."""
        s = SplitSpec(column="Group", mapping={"1": "train", "2": "validation", "3": "holdout", "4": None})
        assert s.mapping["1"] == "train"
        assert s.mapping["4"] is None


# ===========================================================================
# FitRequest
# ===========================================================================

class TestFitRequest:
    def test_minimal_valid(self):
        req = FitRequest(
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            terms=[TermSpec(column="Region", type="categorical")],
        )
        assert req.family == "poisson"  # default
        assert req.link is None
        assert req.offset is None
        assert req.weights is None
        assert req.split is None

    def test_all_fields(self):
        req = FitRequest(
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="gamma",
            link="log",
            offset="Exposure",
            weights="Weight",
            terms=[TermSpec(column="Region", type="categorical")],
            split=SplitSpec(column="Group", mapping={"1": "train"}),
        )
        assert req.family == "gamma"
        assert req.link == "log"
        assert req.offset == "Exposure"
        assert req.weights == "Weight"
        assert req.split is not None

    def test_missing_dataset_path_raises(self):
        with pytest.raises(ValidationError):
            FitRequest(
                response="ClaimNb",
                terms=[TermSpec(column="Region", type="categorical")],
            )

    def test_missing_response_raises(self):
        with pytest.raises(ValidationError):
            FitRequest(
                dataset_path="/tmp/data.csv",
                terms=[TermSpec(column="Region", type="categorical")],
            )

    def test_missing_terms_raises(self):
        with pytest.raises(ValidationError):
            FitRequest(dataset_path="/tmp/data.csv", response="ClaimNb")

    def test_empty_terms_list_valid(self):
        """Empty terms list is valid at schema level — API rejects with 400."""
        req = FitRequest(
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            terms=[],
        )
        assert req.terms == []

    def test_family_default(self):
        req = FitRequest(
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            terms=[TermSpec(column="x", type="linear")],
        )
        assert req.family == "poisson"

    def test_family_override(self):
        req = FitRequest(
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="gaussian",
            terms=[TermSpec(column="x", type="linear")],
        )
        assert req.family == "gaussian"


# ===========================================================================
# ExploreRequest
# ===========================================================================

class TestExploreRequest:
    def test_minimal_valid(self):
        req = ExploreRequest(dataset_path="/tmp/data.csv", response="ClaimNb")
        assert req.family == "poisson"
        assert req.project_id is None
        assert req.split is None

    def test_with_project_id(self):
        req = ExploreRequest(
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            project_id="abc-123",
        )
        assert req.project_id == "abc-123"

    def test_missing_dataset_path_raises(self):
        with pytest.raises(ValidationError):
            ExploreRequest(response="ClaimNb")

    def test_missing_response_raises(self):
        with pytest.raises(ValidationError):
            ExploreRequest(dataset_path="/tmp/data.csv")


# ===========================================================================
# ModelSaveRequest
# ===========================================================================

class TestModelSaveRequest:
    def test_minimal_valid(self):
        req = ModelSaveRequest(
            project_id="abc",
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="poisson",
            terms=[],
        )
        assert req.deviance is None
        assert req.aic is None
        assert req.n_obs is None
        assert req.coef_table is None
        assert req.diagnostics is None
        assert req.split is None

    def test_missing_project_id_raises(self):
        with pytest.raises(ValidationError):
            ModelSaveRequest(
                dataset_path="/tmp/data.csv",
                response="ClaimNb",
                family="poisson",
                terms=[],
            )

    def test_missing_dataset_path_raises(self):
        with pytest.raises(ValidationError):
            ModelSaveRequest(
                project_id="abc",
                response="ClaimNb",
                family="poisson",
                terms=[],
            )

    def test_missing_response_raises(self):
        with pytest.raises(ValidationError):
            ModelSaveRequest(
                project_id="abc",
                dataset_path="/tmp/data.csv",
                family="poisson",
                terms=[],
            )

    def test_missing_family_raises(self):
        with pytest.raises(ValidationError):
            ModelSaveRequest(
                project_id="abc",
                dataset_path="/tmp/data.csv",
                response="ClaimNb",
                terms=[],
            )

    def test_missing_terms_raises(self):
        with pytest.raises(ValidationError):
            ModelSaveRequest(
                project_id="abc",
                dataset_path="/tmp/data.csv",
                response="ClaimNb",
                family="poisson",
            )

    def test_all_optional_fields(self):
        req = ModelSaveRequest(
            project_id="abc",
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="poisson",
            link="log",
            offset="Exposure",
            weights="Weight",
            terms=[TermSpec(column="Region", type="categorical")],
            split=SplitSpec(column="Group", mapping={"1": "train"}),
            deviance=100.5,
            null_deviance=200.0,
            aic=250.3,
            bic=260.1,
            n_obs=1000,
            n_validation=200,
            n_params=10,
            fit_duration_ms=42,
            summary="Model summary text",
            converged=True,
            iterations=15,
            coef_table=[{"name": "Intercept", "coef": -1.5}],
            diagnostics={"train_test": {"train": {"n_obs": 1000}}},
            generated_code="import rustystats",
        )
        assert req.deviance == 100.5
        assert req.converged is True
        assert req.iterations == 15
        assert req.generated_code == "import rustystats"

    def test_negative_deviance_accepted(self):
        """Negative deviance is technically valid in some contexts."""
        req = ModelSaveRequest(
            project_id="abc",
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="poisson",
            terms=[],
            deviance=-10.0,
        )
        assert req.deviance == -10.0

    def test_zero_n_obs_accepted(self):
        """Zero n_obs is accepted at schema level."""
        req = ModelSaveRequest(
            project_id="abc",
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="poisson",
            terms=[],
            n_obs=0,
        )
        assert req.n_obs == 0

    def test_negative_n_obs_accepted(self):
        """Negative n_obs is accepted by Pydantic (no validator)."""
        req = ModelSaveRequest(
            project_id="abc",
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="poisson",
            terms=[],
            n_obs=-5,
        )
        assert req.n_obs == -5


# ===========================================================================
# VersionChange
# ===========================================================================

class TestVersionChange:
    def test_valid_kinds(self):
        for kind in ("added", "removed", "modified"):
            vc = VersionChange(kind=kind, description="some change")
            assert vc.kind == kind

    def test_invalid_kind_raises(self):
        with pytest.raises(ValidationError):
            VersionChange(kind="deleted", description="bad kind")

    def test_missing_kind_raises(self):
        with pytest.raises(ValidationError):
            VersionChange(description="no kind")

    def test_missing_description_raises(self):
        with pytest.raises(ValidationError):
            VersionChange(kind="added")


# ===========================================================================
# SplitMetrics
# ===========================================================================

class TestSplitMetrics:
    def test_all_defaults_none(self):
        sm = SplitMetrics()
        assert sm.n_obs is None
        assert sm.mean_deviance is None
        assert sm.aic is None
        assert sm.gini is None

    def test_all_fields(self):
        sm = SplitMetrics(n_obs=100, mean_deviance=0.5, aic=200.0, gini=0.3)
        assert sm.n_obs == 100
        assert sm.mean_deviance == 0.5
        assert sm.aic == 200.0
        assert sm.gini == 0.3

    def test_zero_n_obs(self):
        sm = SplitMetrics(n_obs=0)
        assert sm.n_obs == 0

    def test_negative_gini(self):
        """Gini can be negative in edge cases."""
        sm = SplitMetrics(gini=-0.1)
        assert sm.gini == -0.1


# ===========================================================================
# ModelSummary
# ===========================================================================

class TestModelSummary:
    def test_minimal(self):
        ms = ModelSummary(id="abc", version=1, created_at="2024-01-01", n_terms=3)
        assert ms.family is None
        assert ms.train == SplitMetrics()
        assert ms.test is None
        assert ms.changes == []

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            ModelSummary(version=1, created_at="2024-01-01", n_terms=3)  # missing id
        with pytest.raises(ValidationError):
            ModelSummary(id="abc", created_at="2024-01-01", n_terms=3)  # missing version
        with pytest.raises(ValidationError):
            ModelSummary(id="abc", version=1, n_terms=3)  # missing created_at
        with pytest.raises(ValidationError):
            ModelSummary(id="abc", version=1, created_at="2024-01-01")  # missing n_terms

    def test_with_changes(self):
        changes = [
            VersionChange(kind="added", description="+ Region (categorical)"),
            VersionChange(kind="removed", description="- Area (categorical)"),
        ]
        ms = ModelSummary(
            id="abc", version=2, created_at="2024-01-01", n_terms=1,
            changes=changes,
        )
        assert len(ms.changes) == 2
        assert ms.changes[0].kind == "added"
        assert ms.changes[1].kind == "removed"

    def test_with_train_and_test_metrics(self):
        ms = ModelSummary(
            id="abc", version=1, created_at="2024-01-01", n_terms=1,
            train=SplitMetrics(n_obs=100),
            test=SplitMetrics(n_obs=50),
        )
        assert ms.train.n_obs == 100
        assert ms.test.n_obs == 50


# ===========================================================================
# ModelDetail
# ===========================================================================

class TestModelDetail:
    def test_minimal(self):
        md = ModelDetail(
            id="abc", version=1, created_at="2024-01-01", spec={"family": "poisson"},
        )
        assert md.deviance is None
        assert md.coef_table is None
        assert md.diagnostics is None
        assert md.generated_code is None

    def test_missing_spec_raises(self):
        with pytest.raises(ValidationError):
            ModelDetail(id="abc", version=1, created_at="2024-01-01")

    def test_empty_spec_valid(self):
        md = ModelDetail(id="abc", version=1, created_at="2024-01-01", spec={})
        assert md.spec == {}

    def test_all_fields(self):
        md = ModelDetail(
            id="abc", version=1, created_at="2024-01-01",
            spec={"family": "poisson", "terms": []},
            deviance=100.0, null_deviance=200.0, aic=250.0, bic=260.0,
            n_obs=500, n_validation=100, n_params=5, fit_duration_ms=42,
            summary="test", converged=True, iterations=10,
            coef_table=[{"name": "Intercept", "coef": -1.0}],
            diagnostics={"train_test": {}},
            generated_code="print('hello')",
        )
        assert md.deviance == 100.0
        assert md.converged is True


# ===========================================================================
# ValidateRequest / ValidateResponse / ValidateIssue
# ===========================================================================

class TestValidateSchemas:
    def test_validate_request_minimal(self):
        req = ValidateRequest(dataset_path="/tmp/data.csv", response="y")
        assert req.family == "poisson"
        assert req.offset is None
        assert req.weights is None

    def test_validate_request_missing_fields(self):
        with pytest.raises(ValidationError):
            ValidateRequest(response="y")  # missing dataset_path
        with pytest.raises(ValidationError):
            ValidateRequest(dataset_path="/tmp/data.csv")  # missing response

    def test_validate_issue(self):
        issue = ValidateIssue(field="response", message="Column not found")
        assert issue.suggestion is None

    def test_validate_issue_with_suggestion(self):
        issue = ValidateIssue(
            field="offset", message="Zeros found", suggestion="Remove zeros",
        )
        assert issue.suggestion == "Remove zeros"

    def test_validate_issue_missing_field_raises(self):
        with pytest.raises(ValidationError):
            ValidateIssue(message="some message")  # missing field

    def test_validate_issue_missing_message_raises(self):
        with pytest.raises(ValidationError):
            ValidateIssue(field="x")  # missing message

    def test_validate_response_defaults(self):
        vr = ValidateResponse()
        assert vr.errors == []
        assert vr.warnings == []

    def test_validate_response_with_issues(self):
        vr = ValidateResponse(
            errors=[ValidateIssue(field="response", message="Not found")],
            warnings=[ValidateIssue(field="offset", message="Has zeros")],
        )
        assert len(vr.errors) == 1
        assert len(vr.warnings) == 1


# ===========================================================================
# ColumnValuesRequest
# ===========================================================================

class TestColumnValuesRequest:
    def test_valid(self):
        req = ColumnValuesRequest(dataset_path="/tmp/data.csv", column="Region")
        assert req.dataset_path == "/tmp/data.csv"
        assert req.column == "Region"

    def test_missing_dataset_path_raises(self):
        with pytest.raises(ValidationError):
            ColumnValuesRequest(column="Region")

    def test_missing_column_raises(self):
        with pytest.raises(ValidationError):
            ColumnValuesRequest(dataset_path="/tmp/data.csv")


# ===========================================================================
# Project schemas
# ===========================================================================

class TestCreateProjectRequest:
    def test_minimal(self):
        req = CreateProjectRequest(name="My Project")
        assert req.name == "My Project"
        assert req.config is None

    def test_with_config(self):
        req = CreateProjectRequest(
            name="Test",
            config=ProjectConfig(
                dataset_path="/tmp/data.csv",
                response="ClaimNb",
                family="poisson",
            ),
        )
        assert req.config.family == "poisson"

    def test_missing_name_raises(self):
        with pytest.raises(ValidationError):
            CreateProjectRequest()

    def test_empty_name_valid(self):
        req = CreateProjectRequest(name="")
        assert req.name == ""


class TestProjectConfig:
    def test_all_none(self):
        """All fields are optional."""
        config = ProjectConfig()
        assert config.dataset_path is None
        assert config.response is None
        assert config.family is None
        assert config.link is None
        assert config.offset is None
        assert config.weights is None
        assert config.split is None
        assert config.columns is None

    def test_all_fields(self):
        config = ProjectConfig(
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="poisson",
            link="log",
            offset="Exposure",
            weights="Weight",
            split=SplitSpec(column="Group", mapping={"1": "train"}),
            columns=[{"name": "Region", "type": "str"}],
        )
        assert config.split.column == "Group"
        assert len(config.columns) == 1


class TestProjectSummary:
    def test_required_fields(self):
        ps = ProjectSummary(
            id="abc", name="Test", n_versions=0,
            created_at="2024-01-01", updated_at="2024-01-01",
        )
        assert ps.family is None
        assert ps.response is None

    def test_missing_required_raises(self):
        with pytest.raises(ValidationError):
            ProjectSummary(
                name="Test", n_versions=0,
                created_at="2024-01-01", updated_at="2024-01-01",
            )  # missing id


class TestProjectDetail:
    def test_required_fields(self):
        pd = ProjectDetail(
            id="abc", name="Test", description="",
            n_versions=0, created_at="2024-01-01", updated_at="2024-01-01",
        )
        assert pd.config is None

    def test_missing_description_raises(self):
        with pytest.raises(ValidationError):
            ProjectDetail(
                id="abc", name="Test",
                n_versions=0, created_at="2024-01-01", updated_at="2024-01-01",
            )


class TestUpdateProjectConfigRequest:
    def test_valid(self):
        req = UpdateProjectConfigRequest(
            config=ProjectConfig(family="gamma"),
        )
        assert req.config.family == "gamma"

    def test_missing_config_raises(self):
        with pytest.raises(ValidationError):
            UpdateProjectConfigRequest()


# ===========================================================================
# Cross-schema: nested validation
# ===========================================================================

class TestNestedValidation:
    def test_fit_request_with_invalid_term_type_in_terms_list(self):
        """Terms with wrong types in the nested list should raise."""
        with pytest.raises(ValidationError):
            FitRequest(
                dataset_path="/tmp/data.csv",
                response="ClaimNb",
                terms=[{"column": "Region"}],  # missing 'type'
            )

    def test_fit_request_with_invalid_split_nested(self):
        """Invalid nested SplitSpec should raise."""
        with pytest.raises(ValidationError):
            FitRequest(
                dataset_path="/tmp/data.csv",
                response="ClaimNb",
                terms=[TermSpec(column="x", type="linear")],
                split={"column": "Group"},  # missing mapping
            )

    def test_model_save_with_nested_split(self):
        req = ModelSaveRequest(
            project_id="abc",
            dataset_path="/tmp/data.csv",
            response="ClaimNb",
            family="poisson",
            terms=[TermSpec(column="Region", type="categorical")],
            split=SplitSpec(column="Group", mapping={"1": "train", "2": "validation"}),
        )
        assert req.split.mapping["1"] == "train"

    def test_model_summary_with_invalid_change_kind(self):
        """VersionChange embedded in ModelSummary with bad kind should raise."""
        with pytest.raises(ValidationError):
            ModelSummary(
                id="abc", version=1, created_at="2024-01-01", n_terms=1,
                changes=[{"kind": "invalid_kind", "description": "bad"}],
            )
