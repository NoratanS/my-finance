require "spec_helper"
require_relative "../../script/hosting_measurement"

RSpec.describe HostingMeasurement do
  it "takes p95 as the nearest-rank sample" do
    samples = (1..20).map { |i| i * 0.1 }.shuffle

    expect(described_class.p95(samples)).to be_within(1e-9).of(1.9)
  end

  it "takes p95 of one sample as that sample" do
    expect(described_class.p95([ 0.2 ])).to eq(0.2)
  end

  it "projects CPU hours from the traffic model" do
    projection = described_class.project(cold: 3.0, warm_mean: 0.1)

    # 600 sessions × (3.0 s cold + 29 × 0.1 s warm) = 3540 s
    expect(projection[:cpu_hours]).to be_within(1e-9).of(3540.0 / 3600)
  end

  it "projects GB-hours as memory × the same in-flight time" do
    projection = described_class.project(cold: 3.0, warm_mean: 0.1)

    expect(projection[:gb_hours]).to be_within(1e-9).of(2 * 3540.0 / 3600)
  end

  it "passes every gate at its limit, except CPU which must stay under" do
    verdicts = described_class.verdicts(cold: 5.0, warm_p95: 0.3, cpu_hours: 1.99)

    expect(verdicts).to all(include(pass: true))
  end

  it "fails each gate past its limit" do
    verdicts = described_class.verdicts(cold: 5.01, warm_p95: 0.301, cpu_hours: 2.0)

    expect(verdicts).to all(include(pass: false))
  end

  it "rejects a warm count below 1 before the idle wait" do
    expect { described_class.run("https://example.com", 0) }.to raise_error(ArgumentError, /at least 1/)
  end
end
