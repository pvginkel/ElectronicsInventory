from dataclasses import dataclass
import json
import csv
import os
import re
import locale

from pathlib import Path


@dataclass
class Filename:
    query: str
    model: str
    reasoning_effort: str
    run: str
    key: str

    @staticmethod
    def parse(stem: str) -> 'Filename':
        parts = stem.split("_")

        key = parts.pop()

        if parts[-1].isdigit():
            run = parts.pop()
        else:
            run = "1"

        query = parts[0]
        model = parts[1]

        if len(parts) >= 3:
            reasoning_effort = parts[2]
        else:
            reasoning_effort = ""

        return Filename(query, model, reasoning_effort, run, key)

def normalize_value(value) -> str:
    """Convert values for CSV CSV."""
    if value is None:
        return ""
    if isinstance(value, list):
        values = []
        for entry in value:
            if isinstance(entry, dict) and "url" in entry:
                entry = entry["url"]
            values.append(normalize_value(entry))
        return "; ".join(values)
    if isinstance(value, (list, dict, tuple)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, float):
        return locale.format_string("%f", value)
    return str(value)


def main():
    locale.setlocale(locale.LC_ALL, "nl_NL.UTF-8")

    output_path = Path(os.path.join(os.path.dirname(__file__), "output"))
    merged_path = Path(os.path.join(os.path.dirname(__file__), "merged"))

    files = sorted(output_path.glob("*.json"))
    if not files:
        raise SystemExit(f"No .json files found in {output_path}")

    merged_path.mkdir(exist_ok=True)

    data_by_file = {}
    queries : dict[tuple[str, str], set[str]] = dict()

    for p in files:
        if p.stem == "schema":
            continue

        parts = Filename.parse(p.stem)
        key = (parts.query, parts.key)
        if key not in queries:
            all_keys : set[str] = set()
            queries[key] = all_keys
        else:
            all_keys = queries[key]
        
        with p.open("r", encoding="utf-8") as f:
            try:
                obj = json.load(f)
            except Exception as e:
                print(f"Failed to parse {p}: {e}")
                raise
        if not isinstance(obj, dict):
            raise ValueError(f"{p.name} doesn't contain JSON")
        data_by_file[p.stem] = obj
        all_keys.update(obj.keys())

    stems_sorted : list[str] = sorted(data_by_file.keys())

    for query, all_keys in queries.items():
        keys_sorted = sorted(all_keys)
        output_csv = merged_path / f"{query[0]}_{query[1]}.csv"

        # utf-8-sig -> better for Excel
        with output_csv.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)

            # headers = keys
            writer.writerow(["model", "run", "reasoning_effort", "elapsed", "cost"] + keys_sorted)
            for stem in stems_sorted:
                parts = Filename.parse(stem)
                if stem.startswith(f"{query[0]}_") and stem.endswith(f"_{query[1]}"):
                    with open(output_path / f"{stem}.txt") as f:
                        info = f.read()
                        # Extract elapsed time
                        elapsed_match = re.match("Elapsed time: (\\d+)", info)
                        elapsed = elapsed_match.group(1) if elapsed_match else ""
                        
                        # Extract cost (optional)
                        cost_match = re.search(r"Cost: \$([0-9.]+)", info)
                        cost = float(cost_match.group(1)) if cost_match else ""

                    row = [parts.model, parts.run, parts.reasoning_effort, elapsed, normalize_value(cost)]
                    for k in keys_sorted:
                        row.append(normalize_value(data_by_file[stem].get(k, "")))
                    writer.writerow(row)

        print(f"CSV written to: {output_csv}")


if __name__ == "__main__":
    main()
