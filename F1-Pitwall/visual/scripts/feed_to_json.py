"""Export Fact_VisualFeed.parquet to harness/feed.json (columnar) for the browser preview.

    python scripts/feed_to_json.py ../data/star/Fact_VisualFeed.parquet
"""
import json
import sys
from pathlib import Path

import pandas as pd

src = Path(sys.argv[1] if len(sys.argv) > 1 else "../data/star/Fact_VisualFeed.parquet")
df = pd.read_parquet(src)
df = df.astype(object).where(df.notna(), None)
out = Path(__file__).resolve().parents[1] / "harness" / "feed.json"
out.write_text(json.dumps({"columns": list(df.columns), "rows": df.values.tolist()}, separators=(",", ":")))
print(f"{len(df)} rows -> {out}")
