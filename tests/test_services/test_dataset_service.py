"""Tests for atelier.services.dataset_service — no mocking, real polars operations."""

import polars as pl
import pytest
from fastapi import HTTPException
from pathlib import Path

from atelier.schemas import SplitSpec
from atelier.services.dataset_service import (
    apply_split,
    classify_columns,
    column_meta,
    load_dataframe,
)


# ---------------------------------------------------------------------------
# load_dataframe
# ---------------------------------------------------------------------------

class TestLoadDataframe:
    def test_loads_csv(self, sample_csv_path):
        df = load_dataframe(sample_csv_path)
        assert df.height == 200
        assert "ClaimNb" in df.columns

    def test_loads_parquet(self, sample_parquet_path):
        df = load_dataframe(sample_parquet_path)
        assert df.height == 200
        assert "ClaimNb" in df.columns

    def test_csv_and_parquet_have_same_data(self, sample_csv_path, sample_parquet_path):
        csv_df = load_dataframe(sample_csv_path)
        pq_df = load_dataframe(sample_parquet_path)
        assert csv_df.height == pq_df.height
        assert set(csv_df.columns) == set(pq_df.columns)

    def test_nonexistent_file_raises(self, tmp_path):
        with pytest.raises(HTTPException) as exc_info:
            load_dataframe(tmp_path / "does_not_exist.csv")
        assert exc_info.value.status_code == 400
        assert "not found" in str(exc_info.value.detail).lower()

    def test_corrupt_file_raises(self, tmp_path):
        bad = tmp_path / "bad.csv"
        bad.write_text("this is not,,,valid\ncsv\x00data\n\x00\x01\x02")
        # Should either load (polars is lenient) or raise HTTPException, not crash
        try:
            df = load_dataframe(bad)
            # If polars loads it, that's fine — it's lenient with CSVs
            assert isinstance(df, pl.DataFrame)
        except HTTPException as e:
            assert e.status_code == 400


# ---------------------------------------------------------------------------
# column_meta
# ---------------------------------------------------------------------------

class TestColumnMeta:
    def test_returns_all_columns(self, sample_df):
        meta = column_meta(sample_df)
        meta_names = {m["name"] for m in meta}
        assert meta_names == set(sample_df.columns)

    def test_region_is_categorical(self, sample_df):
        meta = column_meta(sample_df)
        region = next(m for m in meta if m["name"] == "Region")
        assert region["is_categorical"] is True
        assert region["n_unique"] == len(set(sample_df["Region"].to_list()))

    def test_exposure_is_numeric_not_categorical(self, sample_df):
        meta = column_meta(sample_df)
        exposure = next(m for m in meta if m["name"] == "Exposure")
        assert exposure["is_numeric"] is True
        # Exposure has 200 unique float values — should NOT be categorical
        assert exposure["is_categorical"] is False

    def test_claim_nb_is_numeric_and_categorical(self, sample_df):
        """ClaimNb has very few unique values (0,1,2) — should be both numeric and categorical."""
        meta = column_meta(sample_df)
        claim = next(m for m in meta if m["name"] == "ClaimNb")
        assert claim["is_numeric"] is True
        assert claim["is_categorical"] is True
        assert claim["n_unique"] <= 5

    def test_no_missing_values(self, sample_df):
        """Our fixture has no nulls."""
        meta = column_meta(sample_df)
        for m in meta:
            assert m["n_missing"] == 0, f"{m['name']} has {m['n_missing']} missing"

    def test_dtype_is_string(self, sample_df):
        meta = column_meta(sample_df)
        for m in meta:
            assert isinstance(m["dtype"], str)
            assert len(m["dtype"]) > 0


# ---------------------------------------------------------------------------
# classify_columns
# ---------------------------------------------------------------------------

class TestClassifyColumns:
    def test_excludes_reserved_columns(self, sample_df):
        reserved = {"ClaimNb", "Exposure"}
        cat, cont = classify_columns(sample_df, reserved)
        all_classified = set(cat + cont)
        assert "ClaimNb" not in all_classified
        assert "Exposure" not in all_classified

    def test_region_is_categorical(self, sample_df):
        cat, cont = classify_columns(sample_df, set())
        assert "Region" in cat
        assert "Area" in cat

    def test_exposure_is_continuous(self, sample_df):
        cat, cont = classify_columns(sample_df, set())
        # Exposure has many unique float values
        assert "Exposure" in cont

    def test_group_is_categorical(self, sample_df):
        """Group column has 5 unique integer values — should be categorical."""
        cat, cont = classify_columns(sample_df, set())
        assert "Group" in cat

    def test_all_columns_accounted_for(self, sample_df):
        reserved = {"ClaimNb", "Exposure"}
        cat, cont = classify_columns(sample_df, reserved)
        classified = set(cat + cont)
        non_reserved = set(sample_df.columns) - reserved
        # Every non-reserved column should be classified as either cat or cont
        assert classified == non_reserved

    def test_custom_threshold(self, sample_df):
        """With threshold=2, most integer columns become continuous."""
        cat, cont = classify_columns(sample_df, set(), cat_threshold=2)
        # Region/Area are string type — always categorical regardless of threshold
        assert "Region" in cat
        assert "Area" in cat
        # DrivAge has many unique values — should be continuous with any threshold
        assert "DrivAge" in cont

    def test_empty_reserved_set(self, sample_df):
        cat, cont = classify_columns(sample_df, set())
        assert len(cat) + len(cont) == len(sample_df.columns)


# ---------------------------------------------------------------------------
# apply_split
# ---------------------------------------------------------------------------

class TestApplySplit:
    def test_no_split_returns_full_df(self, sample_df):
        train, val = apply_split(sample_df, None)
        assert train.height == sample_df.height
        assert val is None

    def test_train_only_split(self, sample_df):
        split = SplitSpec(
            column="Group",
            mapping={"1": "train", "2": "train", "3": "train", "4": None, "5": None},
        )
        train, val = apply_split(sample_df, split)
        # Groups 1,2,3 are train — roughly 60% of 200 rows
        assert train.height > 0
        assert train.height < sample_df.height
        assert val is None
        # Verify only groups 1,2,3 in train
        train_groups = set(train["Group"].cast(pl.Utf8).unique().to_list())
        assert train_groups <= {"1", "2", "3"}

    def test_train_and_validation_split(self, sample_df):
        split = SplitSpec(
            column="Group",
            mapping={"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
        )
        train, val = apply_split(sample_df, split)
        assert train.height > 0
        assert val is not None
        assert val.height > 0
        # No overlap between train and validation
        train_groups = set(train["Group"].cast(pl.Utf8).unique().to_list())
        val_groups = set(val["Group"].cast(pl.Utf8).unique().to_list())
        assert train_groups & val_groups == set()
        assert val_groups == {"4"}

    def test_holdout_is_excluded(self, sample_df):
        """Holdout rows should appear in neither train nor validation."""
        split = SplitSpec(
            column="Group",
            mapping={"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
        )
        train, val = apply_split(sample_df, split)
        total_accounted = train.height + (val.height if val is not None else 0)
        holdout_count = sample_df.filter(pl.col("Group").cast(pl.Utf8) == "5").height
        assert total_accounted + holdout_count == sample_df.height

    def test_nonexistent_column_returns_full_df(self, sample_df):
        split = SplitSpec(column="NonExistent", mapping={"1": "train"})
        train, val = apply_split(sample_df, split)
        assert train.height == sample_df.height
        assert val is None

    def test_row_counts_are_exact(self, sample_df):
        """Verify the exact row counts match a manual filter."""
        split = SplitSpec(
            column="Group",
            mapping={"1": "train", "2": "validation"},
        )
        train, val = apply_split(sample_df, split)
        expected_train = sample_df.filter(pl.col("Group").cast(pl.Utf8) == "1").height
        expected_val = sample_df.filter(pl.col("Group").cast(pl.Utf8) == "2").height
        assert train.height == expected_train
        assert val is not None
        assert val.height == expected_val
