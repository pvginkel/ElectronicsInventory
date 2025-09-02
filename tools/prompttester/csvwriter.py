import pprint
import json
import csv
import os
import re

from pathlib import Path


def normalize_value(key, value) -> str:
    """Zet waardes om naar strings voor CSV."""
    if value is None:
        return ""
    if key == "tags" and isinstance(value, list):
        return "; ".join(str(x) for x in value)
    if key in ["datasheet", "product_images", "pinout_diagram", "schematic", "app_note"]:
        if isinstance(value, list):
            return "; ".join([p["url"] for p in value])
        else:
            return value["url"]
    if isinstance(value, (list, dict, tuple)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def main():
    output_path = Path(os.path.join(os.path.dirname(__file__), "output"))
    merged_path = Path(os.path.join(os.path.dirname(__file__), "merged"))

    files = sorted(output_path.glob("*.json"))
    if not files:
        raise SystemExit(f"No .json files found in {output_path}")

    merged_path.mkdir(exist_ok=True)

    data_by_file = {}
    all_keys = set()
    all_attribute_keys = set()
    queries = set()

    for p in files:
        if p.stem == "schema":
            continue

        parts = p.stem.split('_')
        queries.add(parts[0])
        
        with p.open("r", encoding="utf-8") as f:
            obj = json.load(f)
        if not isinstance(obj, dict):
            raise ValueError(f"{p.name} doesn't contain JSON")
        data_by_file[p.stem] = obj
        all_keys.update(obj.keys())
        all_keys.remove("attributes")
        all_attribute_keys.update(obj["attributes"].keys())

    keys_sorted = sorted(all_keys)
    attribute_keys_sorted = sorted(all_attribute_keys)
    stems_sorted = sorted(data_by_file.keys())

    for query in queries:
        output_csv = merged_path / f"{query}.csv"

        # utf-8-sig -> better for Excel
        with output_csv.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)

            # headers = keys
            writer.writerow(["model", "reasoning_effort", "elapsed"] + keys_sorted + attribute_keys_sorted)
            for stem in stems_sorted:
                if stem.startswith(f"{query}_"):
                    parts = stem.split("_")

                    with open(output_path / f"{stem}.txt") as f:
                        info = f.read()
                        match = re.match("Elapsed time: (\\d+)", info)
                        elapsed = match.group(1)

                    row = [parts[1], parts[2] if len(parts) > 2 else "", elapsed]
                    for k in keys_sorted:
                        row.append(normalize_value(k, data_by_file[stem].get(k, "")))
                    for k in attribute_keys_sorted:
                        row.append(normalize_value(k, data_by_file[stem]["attributes"].get(k, "")))
                    writer.writerow(row)

        print(f"CSV written to: {output_csv}")


if __name__ == "__main__":
    main()
