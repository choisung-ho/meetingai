import argparse
import json
import os
from datetime import date, datetime
from decimal import Decimal

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text


DEFAULT_LIMIT = 100
SYSTEM_TABLE_PREFIXES = ("pg_", "sql_")
SYSTEM_TABLES = {"alembic_version"}
SENSITIVE_COLUMNS = {"password_hash"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="View all PostgreSQL database tables and rows without starting the FastAPI server."
    )
    parser.add_argument(
        "--table",
        help="Show only one table. If omitted, all user tables are shown.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Maximum rows per table. Default: {DEFAULT_LIMIT}. Use 0 for no limit.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print output as JSON.",
    )
    parser.add_argument(
        "--show-sensitive",
        action="store_true",
        help="Show sensitive columns such as password_hash. Hidden by default.",
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


def serialize_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def serialize_row(row, show_sensitive):
    data = {}
    for key, value in row._mapping.items():
        if key in SENSITIVE_COLUMNS and not show_sensitive:
            data[key] = "***hidden***"
        else:
            data[key] = serialize_value(value)
    return data


def fetch_table(connection, table_name, limit, show_sensitive):
    count = connection.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar_one()

    query = f'SELECT * FROM "{table_name}"'
    if limit > 0:
        query += " LIMIT :limit"
        rows = connection.execute(text(query), {"limit": limit}).fetchall()
    else:
        rows = connection.execute(text(query)).fetchall()

    return {
        "row_count": count,
        "shown_count": len(rows),
        "rows": [serialize_row(row, show_sensitive) for row in rows],
    }


def print_text_report(result):
    for table_name, table_data in result.items():
        print(f"\n=== {table_name} ===")
        print(f"rows: {table_data['row_count']} / shown: {table_data['shown_count']}")
        if not table_data["rows"]:
            print("(empty)")
            continue

        for index, row in enumerate(table_data["rows"], start=1):
            print(f"\n[{index}]")
            for key, value in row.items():
                print(f"{key}: {value}")


def main():
    args = parse_args()
    engine = create_engine(get_database_url(), pool_pre_ping=True)

    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = sorted(name for name in inspector.get_table_names() if is_user_table(name))

        if args.table:
            if args.table not in table_names:
                raise RuntimeError(
                    f"Table '{args.table}' not found. Available tables: {', '.join(table_names)}"
                )
            table_names = [args.table]

        result = {
            table_name: fetch_table(
                connection=connection,
                table_name=table_name,
                limit=args.limit,
                show_sensitive=args.show_sensitive,
            )
            for table_name in table_names
        }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_text_report(result)


if __name__ == "__main__":
    main()
