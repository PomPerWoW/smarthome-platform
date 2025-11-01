import os
from contextlib import contextmanager
from pathlib import Path

from BTrees.OOBTree import OOBTree
from ZODB import DB
from ZODB.FileStorage import FileStorage
import transaction


_db_instance = None


def _get_storage_path() -> str:
    base_dir = Path(__file__).resolve().parent.parent
    data_dir = base_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return str(data_dir / "smarthome.fs")


def get_db() -> DB:
    global _db_instance
    if _db_instance is None:
        storage = FileStorage(_get_storage_path())
        _db_instance = DB(storage)
    return _db_instance


@contextmanager
def get_connection():
    db = get_db()
    connection = db.open()
    try:
        root = connection.root()
        # Ensure root containers exist
        if "homes" not in root:
            root["homes"] = OOBTree()
            transaction.commit()
        yield connection, root
        # Caller is responsible for committing/aborting
    finally:
        connection.close()


def commit():
    transaction.commit()


def abort():
    transaction.abort()


