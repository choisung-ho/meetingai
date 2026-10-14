import argparse
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text


SYSTEM_TABLE_PREFIXES = ("pg_", "sql_")
SYSTEM_TABLES = {"alembic_version"}


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Clear PostgreSQL table contents without dropping tables. "
            "This script is separate from the FastAPI server."
        )
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Actually delete all user-table rows. Without this flag, only a preview is printed.",
    )
    return parser.parse_args()


def get_database_url():
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set. Add it to your .env file.")
    return database_url


def is_user_table(table_name):
    return not table_name.startswith(SYSTEM_TABLE_PREFIXES) and table_name not in SYSTEM_TABLES


def get_user_tables(connection):
    inspector = inspect(connection)
    return sorted(name for name in inspector.get_table_names() if is_user_table(name))


def quote_table_names(table_names):
    return ", ".join(f'"{table_name}"' for table_name in table_names)


def count_rows(connection, table_names):
    return {
        table_name: connection.execute(
            text(f'SELECT COUNT(*) FROM "{table_name}"')
        ).scalar_one()
        for table_name in table_names
    }


def print_counts(title, counts):
    print(f"\n{title}")
    for table_name, count in counts.items():
        print(f"- {table_name}: {count}")


def main():
    args = parse_args()
    engine = create_engine(get_database_url(), pool_pre_ping=True)

    with engine.connect() as connection:
        table_names = get_user_tables(connection)
        if not table_names:
            print("No user tables found.")
            return

        before_counts = count_rows(connection, table_names)

    print("Target tables:")
    for table_name in table_names:
        print(f"- {table_name}")
    print_counts("Rows before clear:", before_counts)

    if not args.yes:
        print(
            "\nPreview only. Run with --yes to remove every row above, "
            "including auth users and workspaces."
        )
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                f"TRUNCATE TABLE {quote_table_names(table_names)} "
                "RESTART IDENTITY CASCADE"
            )
        )
        after_counts = count_rows(connection, table_names)

    print_counts("Rows after clear:", after_counts)
    print("\nDatabase contents cleared. Table structures remain.")


if __name__ == "__main__":
    main()
