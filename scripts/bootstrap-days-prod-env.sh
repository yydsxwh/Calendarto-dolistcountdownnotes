#!/usr/bin/env bash
# Run on the Hong Kong box. Fill missing BFF env keys; never print secret values;
# never invent ACCOUNT_CLIENT_SECRET; never delete /var/lib/kemiao-days.
set -euo pipefail

ENVF="${DAYS_ENV_FILE:-/etc/kemiao-days-sync.env}"
DROPIN="${DAYS_ENV_DROPIN:-/etc/systemd/system/kemiao-days-sync.service.d/env.conf}"
DATA_DIR="${DAYS_SYNC_DATA_DIR:-/var/lib/kemiao-days}"
WWW_DB="${WWW_USER_DB:-/var/www/yyds-course-platform/prisma/prod.db}"
ACCOUNT_DB="${ACCOUNT_USER_DB:-/var/www/account/data/prod.db}"

sudo mkdir -p "$(dirname "$ENVF")" "$DATA_DIR"
if ! sudo test -f "$ENVF"; then
  echo '# 日事 BFF 密钥。ACCOUNT_CLIENT_SECRET 由站长在后台手工填写。' | sudo tee "$ENVF" >/dev/null
fi
sudo chmod 640 "$ENVF"
sudo chown root:www-data "$ENVF" 2>/dev/null || sudo chown root:root "$ENVF"

env_get() {
  sudo awk -F= -v k="$1" '$1==k {print substr($0, index($0,"=")+1); exit}' "$ENVF"
}

env_set() {
  local name="$1" value="$2"
  if sudo grep -q "^${name}=" "$ENVF"; then
    sudo awk -v k="$name" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$ENVF" | sudo tee "$ENVF.tmp" >/dev/null
    sudo mv "$ENVF.tmp" "$ENVF"
  else
    printf '%s=%s\n' "$name" "$value" | sudo tee -a "$ENVF" >/dev/null
  fi
}

ensure_secret() {
  local name="$1" current
  current="$(env_get "$name" || true)"
  if [[ -n "${current}" ]]; then
    echo "$name=kept"
    return
  fi
  env_set "$name" "$(openssl rand -hex 32)"
  echo "$name=generated"
}

ensure_default() {
  local name="$1" value="$2" current
  current="$(env_get "$name" || true)"
  if [[ -n "${current}" ]]; then
    echo "$name=kept"
    return
  fi
  env_set "$name" "$value"
  echo "$name=set-default"
}

ensure_secret RISHI_SESSION_SECRET
ensure_secret RISHI_CONFIG_ENCRYPTION_KEY
ensure_default ACCOUNT_ISSUER 'https://account.yydsxwh.com'
ensure_default ACCOUNT_CLIENT_ID 'rishi'
ensure_default ACCOUNT_REDIRECT_URI 'https://www.yydsxwh.com/api/days/auth/callback'
ensure_default ACCOUNT_SCOPES 'openid profile email'
ensure_default NODE_ENV production

if sudo grep -q '^ACCOUNT_CLIENT_SECRET=' "$ENVF"; then
  echo 'ACCOUNT_CLIENT_SECRET=present-leave-for-admin'
else
  env_set ACCOUNT_CLIENT_SECRET ''
  echo 'ACCOUNT_CLIENT_SECRET=empty-for-admin'
fi

admin_current="$(env_get RISHI_ADMIN_SUBS || true)"
if [[ -z "$admin_current" ]]; then
  export WWW_USER_DB="$WWW_DB" ACCOUNT_USER_DB="$ACCOUNT_DB"
  admin_list="$(python3 - <<'PY'
import sqlite3, os
subs=[]
seen=set()
def add(value):
    value=(value or "").strip()
    if value and value not in seen:
        seen.add(value)
        subs.append(value)
www=os.environ.get("WWW_USER_DB","")
account=os.environ.get("ACCOUNT_USER_DB","")
if os.path.exists(www):
    con=sqlite3.connect(f"file:{www}?mode=ro", uri=True)
    for row in con.execute("select id, accountSub, role, roles from User"):
        role=f"{row[2] or ''} {row[3] or ''}".upper()
        if "ADMIN" in role:
            add(row[0]); add(row[1])
    con.close()
if os.path.exists(account):
    con=sqlite3.connect(f"file:{account}?mode=ro", uri=True)
    for row in con.execute("select publicId, role, roles from User"):
        role=f"{row[1] or ''} {row[2] or ''}".upper()
        if "ADMIN" in role:
            add(row[0])
    con.close()
print(",".join(subs))
PY
)"
  if [[ -n "$admin_list" ]]; then
    env_set RISHI_ADMIN_SUBS "$admin_list"
    echo 'RISHI_ADMIN_SUBS=bootstrapped'
  else
    echo 'RISHI_ADMIN_SUBS=empty'
  fi
else
  echo 'RISHI_ADMIN_SUBS=kept'
fi

if sudo test -f "$DROPIN" && ! sudo grep -q 'ACCOUNT_SCOPES=' "$DROPIN"; then
  echo 'Environment="ACCOUNT_SCOPES=openid profile email"' | sudo tee -a "$DROPIN" >/dev/null
  echo 'dropin=ACCOUNT_SCOPES-added'
fi

echo "data-dir-kept=$DATA_DIR files=$(sudo find "$DATA_DIR" -type f | wc -l)"
