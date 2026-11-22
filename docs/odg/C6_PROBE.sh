#!/bin/sh
# V308/V309 — C6 8 probes, run BY THE SANDBOX CHILD (cwd=/work). Writes /work/c6-evidence.json (V301 schema).
set +e
NET=$([ "$(find /sys/class/net -mindepth 1 -maxdepth 1 ! -name lo 2>/dev/null | wc -l)" -eq 0 ] && echo true || echo false)
REPO=$([ ! -e /home/ubuntu/bmax-v21 ] && [ ! -e /home/ubuntu/odg-releases ] && echo true || echo false)
WORK=$( (touch /work/.c6p && rm -f /work/.c6p) >/dev/null 2>&1 && echo true || echo false)
KEY=$([ -z "${ANTHROPIC_API_KEY+x}" ] && echo true || echo false)
AH=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 https://api.anthropic.com/ 2>/dev/null)
PC=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 https://platform.claude.com/ 2>/dev/null)
EX=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 https://example.com/ 2>/dev/null)
PROXY=$([ -n "$AH" ] && [ "$AH" != 000 ] && { [ -z "$EX" ] || [ "$EX" = 000 ] || [ "$EX" = 403 ]; } && echo true || echo false)
CL=$(claude --print "Reponds exactement ODG_C6_CLAUDE_OK" 2>/dev/null); CLR=$?
CLOK=$( [ $CLR -eq 0 ] && printf '%s' "$CL" | grep -q ODG_C6_CLAUDE_OK && echo true || echo false)
# --noproxy 127.0.0.1: loopback Ollama must bypass the bridge http_proxy (egress broker). Without it the
# broker denies the loopback call (DENY invalid proxy method). Loopback is not egress; the broker still
# governs all real egress unchanged. (The #686 half-close fix is unrelated — curl --noproxy never half-closes.)
TAGS=$(curl -sS --noproxy 127.0.0.1 --max-time 10 http://127.0.0.1:11434/api/tags 2>/dev/null)
OLL=$(printf '%s' "$TAGS" | grep -q 'qwen2.5-coder:7b' && echo true || echo false)
GEN=$(curl -sS --noproxy 127.0.0.1 --max-time 90 http://127.0.0.1:11434/api/generate -H 'Content-Type: application/json' -d '{"model":"qwen2.5-coder:7b","prompt":"Reponds exactement ODG_C6_OLLAMA_OK","stream":false}' 2>/dev/null)
GENOK=$(printf '%s' "$GEN" | grep -q '"response"' && echo true || echo false)
cat > /work/c6-evidence.json <<JSON
{"tests":[
{"n":1,"pass":$NET,"evidence":"only-lo=$NET ifaces=$(ls /sys/class/net 2>/dev/null|tr '\n' ' ')"},
{"n":2,"pass":$PROXY,"evidence":"anthropic=$AH platform=$PC non-allowed(example)=$EX"},
{"n":3,"pass":$KEY,"evidence":"ANTHROPIC_API_KEY unset=$KEY"},
{"n":4,"pass":$CLOK,"evidence":"claude --print rc=$CLR reply_has_token=$CLOK"},
{"n":5,"pass":$OLL,"evidence":"api/tags qwen2.5-coder:7b present=$OLL"},
{"n":6,"pass":$GENOK,"evidence":"generate response_present=$GENOK"},
{"n":7,"pass":$WORK,"evidence":"/work writable=$WORK"},
{"n":8,"pass":$REPO,"evidence":"canonical repo invisible=$REPO"}],
"session":{"netnsOnlyLo":$NET,"canonicalInvisible":$REPO,"workWritable":$WORK,"noAnthropicKey":$KEY}}
JSON
echo "wrote /work/c6-evidence.json"; cat /work/c6-evidence.json
