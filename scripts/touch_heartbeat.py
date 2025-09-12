from datetime import datetime, timedelta, timezone
import re, pathlib

JST = timezone(timedelta(hours=9))
stamp = datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S JST")

p = pathlib.Path("README.md")
s = p.read_text(encoding="utf-8")
new = re.sub(r"- \*\*Last touched \(JST\)\*\*: .*$",
             f"- **Last touched (JST)**: {stamp}",
             s, flags=re.M)

if s != new:
    p.write_text(new + ("\n" if not new.endswith("\n") else ""), encoding="utf-8")
    print("updated:", stamp)
else:
    print("no-change (already up-to-date)", stamp)