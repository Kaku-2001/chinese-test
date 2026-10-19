#!/usr/bin/env bash
# 変更を push する前の確認。何も記録しません。
#   1) config.js・sw.js・index.html の中のスクリプト・apps-script/*.gs の文法チェック
#   2) apps-script/Code.gs を手元のシミュレーターで動かす確認（tools/test-gas.js）
#   3) config.js の3クラスの Apps Script が応答するか（存在しないコードで api_status を呼ぶだけ）
# 使い方: bash tools/check.sh          （3 を飛ばすときは OFFLINE=1）
set -u
cd "$(dirname "$0")/.."
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

for f in config.js sw.js apps-script/*.gs; do
  [ -f "$f" ] || continue
  cp "$f" "$tmp/x.js"
  if node --check "$tmp/x.js" 2>"$tmp/err"; then echo "OK   $f"; else echo "NG   $f"; cat "$tmp/err"; fail=1; fi
done

# index.html のインラインスクリプト（src のない <script>）を取り出して確認
node -e '
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, i = 0, bad = 0;
while ((m = re.exec(html))) {
  i++;
  try { new Function(m[1]); } catch (e) { bad++; console.log("NG   index.html script #" + i + ": " + e.message); }
}
if (!bad) console.log("OK   index.html (" + i + " scripts)");
process.exit(bad ? 1 : 0);
' || fail=1

# apps-script/Code.gs を手元で動かして、受験・提出・結果の流れを確かめる（本物のシートには触らない）
if [ -f apps-script/Code.gs ]; then
  node tools/test-gas.js || fail=1
fi

if [ "${OFFLINE:-0}" != 1 ]; then
  node -e 'global.window = {}; eval(require("fs").readFileSync("config.js", "utf8"));
    window.APP_CONFIG.classes.forEach(c => console.log(c.id + " " + c.url));' |
  while read -r id url; do
    res=$(curl -sSL -m 40 -H 'Content-Type: text/plain;charset=utf-8' \
      -d '{"fn":"api_status","args":["ZZZZZZ"]}' "$url" 2>&1 | head -c 200)
    case "$res" in
      '{"ok":false'*) echo "OK   live $id 応答あり" ;;
      *) echo "NG   live $id: $res"; echo x >> "$tmp/livefail" ;;
    esac
  done
  [ -f "$tmp/livefail" ] && fail=1
fi

exit $fail
