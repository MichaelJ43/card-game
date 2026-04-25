#!/bin/bash
set -euo pipefail
if ! command -v turnserver >/dev/null 2>&1; then
  dnf install -y coturn
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
