# Run using bin/ci (from api/): the same gate the deploy runs, before you push.

CI.run do
  step "Setup", "bin/setup --skip-server"

  step "Style: Ruby", "bin/rubocop"
  step "Tests: RSpec", "bundle exec rspec"

  step "Security: Gem audit", "bin/bundler-audit"
  step "Security: Brakeman code analysis", "bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error"

  # Skips npm ci when node_modules exists, so a running bin/dev keeps its install.
  step "Web: Setup", "cd ../web && { [ -d node_modules ] || npm ci; }"
  step "OpenAPI: drift", "../bin/openapi-drift"

  step "Web: Lint", "cd ../web && npm run lint"
  step "Web: Types", "cd ../web && npm run typecheck"
  step "Web: Format", "cd ../web && npm run format:check"
  step "Web: Tests", "cd ../web && npm test"
end
