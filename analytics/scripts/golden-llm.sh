#!/usr/bin/env bash
# Sentence -> plan golden suite against a REAL model. Local only, never CI
# (design delta D11): a multi-gigabyte pull plus CPU inference on every PR is
# how a job goes permanently red and everyone learns to ignore it.
#
#   ./scripts/golden-llm.sh                            # the pinned default model
#   OLLAMA_MODEL=llama3.2:3b ./scripts/golden-llm.sh   # benchmark a candidate
set -eu

cd "$(dirname "$0")/.."

: "${OLLAMA_URL:=http://localhost:11434}"
: "${OLLAMA_MODEL:=qwen3:4b}"
export OLLAMA_URL OLLAMA_MODEL
export RUN_LLM_GOLDEN=1

if ! curl -fsS -o /dev/null "$OLLAMA_URL/api/version"; then
  echo "Error: no Ollama answering at $OLLAMA_URL."
  echo "Start it with: docker compose --profile ai up -d ollama"
  exit 1
fi

if ! curl -fsS "$OLLAMA_URL/api/tags" | grep -q "\"$OLLAMA_MODEL\""; then
  echo "Error: the model $OLLAMA_MODEL is not pulled."
  echo "Pull it with: docker compose --profile ai exec ollama ollama pull $OLLAMA_MODEL"
  exit 1
fi

echo "Golden suite against $OLLAMA_MODEL:"
uv run pytest tests/test_llm_golden.py -v
