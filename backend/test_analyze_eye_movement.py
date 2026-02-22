from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from services.gemini_service import analyze_eye_movement_sync


def load_input(input_path: Path) -> dict:
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    return json.loads(input_path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run analyze_eye_movement on sample data and print Gemini output."
    )
    parser.add_argument(
        "--input",
        type=str,
        default="services/sample_input.json",
        help="Path to input JSON file.",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save output JSON to backend/test_outputs/ with a timestamped filename.",
    )
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parent
    input_path = (backend_dir / args.input).resolve()

    print(f"Using input: {input_path}")
    payload = load_input(input_path)

    print("Running Gemini analysis...")
    result = analyze_eye_movement_sync(payload)

    pretty = json.dumps(result, indent=2, ensure_ascii=False)
    print("\nGemini Output:\n")
    print(pretty)

    if args.save:
        out_dir = backend_dir / "test_outputs"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"gemini_output_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        out_file.write_text(pretty + "\n", encoding="utf-8")
        print(f"\nSaved output to: {out_file}")


if __name__ == "__main__":
    main()
