#!/bin/bash
set -euo pipefail
dnf install -y coturn
cat >/etc/turnserver.conf <<TURNCONF
listening-port=3478
no-tls
fingerprint
lt-cred-mech
no-cli
no-tlsv1
no-tlsv1_1
realm=${realm}
user=${turn_user}:${turn_password}
min-port=49152
max-port=65535
simple-log
log-file=/var/log/turnserver.log
TURNCONF
systemctl enable coturn
systemctl restart coturn
