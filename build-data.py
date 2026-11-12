"""Bundle data/*.json into data.js so the page works on GitHub Pages and when opened from disk."""

import hashlib
import json
import re
from pathlib import Path

from public_wording import public_text

ROOT = Path(__file__).parent

# These exports report gross pay including the bonus; the others report base pay before it.
GROSS_INCLUDES_BONUS = {"dk-nl.json", "south-cee.json"}

LEVELS = ("junior", "mid", "senior")

ASSETS = ("style.css", "data.js", "app.js", "favicon.svg", "favicon-32.png", "apple-touch-icon.png")

def base_salary(city: dict, includes_bonus: bool) -> dict:
    if not includes_bonus:
        return {level: city["gross_yearly"][level] for level in LEVELS}

    return {
        level: round(city["gross_yearly"][level] / (1 + city["bonus_rate"][level]))
        for level in LEVELS
    }


def main() -> None:
    cities = []

    for path in sorted((ROOT / "data").glob("[!_]*.json")):
        includes_bonus = path.name in GROSS_INCLUDES_BONUS

        for city in json.loads(path.read_text(encoding="utf-8")):
            city["base_yearly"] = base_salary(city, includes_bonus)

            for field in ("tax_regime_note", "language", "commute_note", "notes"):
                city[field] = public_text(city.get(field))

            cities.append(city)

    payload = json.dumps(cities, ensure_ascii=False, indent=1)
    (ROOT / "data.js").write_text("window.CITIES = " + payload + ";\n", encoding="utf-8")

    print(f"wrote data.js with {len(cities)} cities")

    stamp_asset_versions()


# GitHub Pages lets browsers reuse files for 10 minutes, so a new index.html could run with an old style.css.
def stamp_asset_versions() -> None:
    index = ROOT / "index.html"
    html = index.read_text(encoding="utf-8")

    for name in ASSETS:
        version = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()[:10]
        html = re.sub(rf'"{re.escape(name)}(\?v=\w+)?"', f'"{name}?v={version}"', html)

    index.write_text(html, encoding="utf-8")
    print("stamped asset versions in index.html")


if __name__ == "__main__":
    main()
