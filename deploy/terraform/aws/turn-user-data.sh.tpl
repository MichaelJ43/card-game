#!/bin/bash
set -euo pipefail
if ! command -v turnserver >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y coturn
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y coturn
  else
    echo "No supported package manager found for coturn install" >&2
    exit 1
  fi
fi
# Quoted heredoc so the coturn password is not re-expanded by bash (e.g. `$` in the secret).
cat >/etc/turnserver.conf <<'TURNCONF'
listening-port=3478
no-tls
fingerprint
lt-cred-mech
no-cli
no-tlsv1
no-tlsv1_1
realm=${realm}
user=${turn_user}:${turn_password}
min-port=${min_port}
max-port=${max_port}
simple-log
log-file=/var/log/turnserver.log
TURNCONF
systemctl enable coturn
systemctl restart coturn
