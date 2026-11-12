# Measures /api/health on a deployed host against the M1 hosting gates (ADR 0013).
# Run it through bin/measure-hosting. Stdlib only, so it runs without bundling.
require "net/http"
require "uri"

module HostingMeasurement
  # Traffic model approved for #7: every session wakes a cold instance.
  USERS = 10
  SESSIONS_PER_USER_PER_DAY = 2
  REQUESTS_PER_SESSION = 30
  DAYS_PER_MONTH = 30
  SESSIONS_PER_MONTH = USERS * SESSIONS_PER_USER_PER_DAY * DAYS_PER_MONTH

  # Hobby's default function size; memory is billed while a request is in flight.
  MEMORY_GB = 2
  INCLUDED_GB_HOURS = 360

  # Prod scales to zero after 5 min idle and Neon suspends after 5; 11 clears both.
  IDLE_MINUTES = 11

  MODEL = "Model: #{USERS} users × #{SESSIONS_PER_USER_PER_DAY} sessions/day × #{REQUESTS_PER_SESSION} " \
          "requests, every session a cold wake (#{SESSIONS_PER_MONTH} sessions/month).".freeze
  CAVEAT = "\nCPU is wall-clock time, an upper bound on Active CPU: a pass is a pass. " \
           "A fail must be confirmed against Vercel's Active CPU dashboard before any ADR.".freeze

  # Each gate compares the measured value to its limit with its own operator.
  GATES = [
    { name: "cold first response", key: :cold, compare: :<=, limit: 5.0, unit: "s" },
    { name: "warm p95", key: :warm_p95, compare: :<=, limit: 0.3, unit: "s" },
    { name: "projected CPU/month", key: :cpu_hours, compare: :<, limit: 2.0, unit: "h" }
  ].freeze

  module_function

  # Nearest-rank percentile: the smallest sample with at least 95% of samples at or below it.
  def p95(samples)
    sorted = samples.sort
    sorted[(sorted.size * 0.95).ceil - 1]
  end

  # Wall-clock time stands in for Active CPU, so cpu_hours is an upper bound.
  def project(cold:, warm_mean:)
    hours = SESSIONS_PER_MONTH * (cold + ((REQUESTS_PER_SESSION - 1) * warm_mean)) / 3600
    { cpu_hours: hours, gb_hours: MEMORY_GB * hours }
  end

  def verdicts(**values)
    GATES.map do |gate|
      value = values.fetch(gate[:key])
      gate.merge(value: value, pass: value.public_send(gate[:compare], gate[:limit]))
    end
  end

  # bypass_secret: Protection Bypass for Automation, needed only for protected previews.
  def run(base_url, warm_count, bypass_secret: nil)
    raise ArgumentError, "warm requests must be at least 1" unless warm_count.positive?

    uri = URI.join(base_url, "/api/health")
    wait_until_cold(uri)
    headers = bypass_secret ? { "x-vercel-protection-bypass" => bypass_secret } : {}
    # The cold sample includes connecting, as a first visit does.
    cold = timed { start(uri) { |http| get(http, uri, headers) } }
    # One kept-alive connection, like the SPA's: TLS setup is paid once, not per sample.
    warm = start(uri) { |http| Array.new(warm_count) { timed { get(http, uri, headers) } } }
    puts report(cold, warm)
  end

  def wait_until_cold(uri)
    puts "Waiting #{IDLE_MINUTES} min with no requests, so the first one is fully cold."
    puts "Nothing else may hit #{uri.host} meanwhile (no deploys, no browser tabs)."
    sleep IDLE_MINUTES * 60
  end

  def timed
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    yield
    Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
  end

  def start(uri, &)
    Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", read_timeout: 60, &)
  end

  def get(http, uri, headers)
    response = http.request(Net::HTTP::Get.new(uri, headers))
    abort "#{uri} answered #{response.code}, expected 200" unless response.code == "200"
  end

  def report(cold, warm)
    warm_p95 = p95(warm)
    projection = project(cold: cold, warm_mean: warm.sum / warm.size)
    verdict_lines = verdicts(cold: cold, warm_p95: warm_p95, cpu_hours: projection[:cpu_hours]).map { |v| verdict_line(v) }
    [
      format("\ncold %.2f s · warm p95 %.0f ms over %d requests", cold, warm_p95 * 1000, warm.size),
      MODEL, *verdict_lines,
      format("info projected memory %.1f GB-h of %d included (informational, %d GB × in-flight time)",
             projection[:gb_hours], INCLUDED_GB_HOURS, MEMORY_GB),
      CAVEAT
    ]
  end

  def verdict_line(verdict)
    format("%-4s %-20s %.3f %s (limit %s %.1f %s)", verdict[:pass] ? "PASS" : "FAIL", verdict[:name],
           verdict[:value], verdict[:unit], verdict[:compare], verdict[:limit], verdict[:unit])
  end
end
