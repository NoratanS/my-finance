# Run with: ruby test/bin/measure_hosting_test.rb
require "minitest/autorun"
load File.expand_path("../../bin/measure-hosting", __dir__)

class MeasureHostingTest < Minitest::Test
  def test_p95_is_the_nearest_rank_sample
    samples = (1..20).map { |i| i * 0.1 }.shuffle

    assert_in_delta 1.9, HostingMeasurement.p95(samples)
  end

  def test_p95_of_one_sample_is_that_sample
    assert_in_delta 0.2, HostingMeasurement.p95([ 0.2 ])
  end

  def test_projection_follows_the_traffic_model
    projection = HostingMeasurement.project(cold: 3.0, warm_mean: 0.1)

    # 600 sessions × (3.0 s cold + 29 × 0.1 s warm) = 3540 s
    assert_in_delta 3540.0 / 3600, projection[:cpu_hours]
    assert_in_delta 2 * 3540.0 / 3600, projection[:gb_hours]
  end

  def test_verdicts_pass_within_every_gate
    verdicts = HostingMeasurement.verdicts(cold: 5.0, warm_p95: 0.3, cpu_hours: 1.99)

    assert_equal [ true, true, true ], verdicts.map { |v| v[:pass] }
  end

  def test_verdicts_fail_each_gate_on_its_own
    verdicts = HostingMeasurement.verdicts(cold: 5.01, warm_p95: 0.301, cpu_hours: 2.0)

    assert_equal [ false, false, false ], verdicts.map { |v| v[:pass] }
  end
end
