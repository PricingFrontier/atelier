"""Tests for config.py — path constants and ensure_data_dir."""

import importlib
from pathlib import Path
from unittest.mock import patch

from atelier.config import (
    ATELIER_HOME,
    DB_PATH,
    LOGS_DIR,
    MAX_UPLOAD_SIZE_MB,
    PROJECTS_DIR,
    SUPPORTED_FORMATS,
    ensure_data_dir,
)


class TestPathConstants:
    def test_atelier_home_under_user_home(self):
        assert ATELIER_HOME == Path.home() / ".atelier"

    def test_projects_dir_under_atelier_home(self):
        assert PROJECTS_DIR == ATELIER_HOME / "projects"

    def test_logs_dir_under_atelier_home(self):
        assert LOGS_DIR == ATELIER_HOME / "logs"

    def test_db_path_under_atelier_home(self):
        assert DB_PATH == ATELIER_HOME / "atelier.db"

    def test_db_path_has_sqlite_extension(self):
        assert DB_PATH.suffix == ".db"

    def test_max_upload_size(self):
        assert MAX_UPLOAD_SIZE_MB == 500

    def test_supported_formats(self):
        assert "csv" in SUPPORTED_FORMATS
        assert "parquet" in SUPPORTED_FORMATS


class TestEnsureDataDir:
    def test_creates_directories_when_missing(self, tmp_path):
        fake_home = tmp_path / ".atelier"
        fake_projects = fake_home / "projects"
        fake_logs = fake_home / "logs"

        with (
            patch("atelier.config.ATELIER_HOME", fake_home),
            patch("atelier.config.PROJECTS_DIR", fake_projects),
            patch("atelier.config.LOGS_DIR", fake_logs),
        ):
            # Verify none exist yet
            assert not fake_home.exists()
            assert not fake_projects.exists()
            assert not fake_logs.exists()

            ensure_data_dir()

            # All three should now exist
            assert fake_home.is_dir()
            assert fake_projects.is_dir()
            assert fake_logs.is_dir()

    def test_idempotent(self, tmp_path):
        fake_home = tmp_path / ".atelier"
        fake_projects = fake_home / "projects"
        fake_logs = fake_home / "logs"

        with (
            patch("atelier.config.ATELIER_HOME", fake_home),
            patch("atelier.config.PROJECTS_DIR", fake_projects),
            patch("atelier.config.LOGS_DIR", fake_logs),
        ):
            ensure_data_dir()
            ensure_data_dir()  # second call should not raise

            assert fake_home.is_dir()
            assert fake_projects.is_dir()
            assert fake_logs.is_dir()

    def test_existing_dirs_preserved(self, tmp_path):
        fake_home = tmp_path / ".atelier"
        fake_projects = fake_home / "projects"
        fake_logs = fake_home / "logs"

        # Pre-create directories and a marker file
        fake_projects.mkdir(parents=True)
        fake_logs.mkdir(parents=True)
        marker = fake_projects / "keep_me.txt"
        marker.write_text("important")

        with (
            patch("atelier.config.ATELIER_HOME", fake_home),
            patch("atelier.config.PROJECTS_DIR", fake_projects),
            patch("atelier.config.LOGS_DIR", fake_logs),
        ):
            ensure_data_dir()

            # Marker file should still exist
            assert marker.exists()
            assert marker.read_text() == "important"
