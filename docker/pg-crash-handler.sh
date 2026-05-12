#!/bin/bash
# supervisord event listener — restart api+workers when postgresql exits.
# Implements the supervisord event listener protocol:
#   1. Write READY\n  → tells supervisord we're ready for the next event
#   2. Read header    → one line with metadata including payload length
#   3. Read payload   → process details (processname, from_state, etc.)
#   4. Write RESULT 2\nOK → acknowledge the event
while true; do
    printf "READY\n"
    read -r header

    payload_len=$(echo "$header" | tr ' ' '\n' | grep '^len:' | cut -d: -f2)
    if [ -n "$payload_len" ] && [ "$payload_len" -gt 0 ] 2>/dev/null; then
        payload=$(dd bs=1 count="$payload_len" 2>/dev/null)
        if echo "$payload" | grep -q "processname:postgresql"; then
            echo "PostgreSQL exited — restarting api and workers" >&2
            supervisorctl restart api workers >/dev/null 2>&1 || true
        fi
    fi

    printf "RESULT 2\nOK"
done
