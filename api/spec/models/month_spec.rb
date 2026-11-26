require "rails_helper"

RSpec.describe Month do
  describe ".parse" do
    it "reads a YYYY-MM month and prints it back the same" do
      month = described_class.parse("2026-01")

      expect([ month.year, month.month, month.to_s ]).to eq([ 2026, 1, "2026-01" ])
    end

    it "refuses anything but YYYY-MM with a month from 01 to 12" do
      accepted = [ "2026-00", "2026-13", "2026-1", "02026-01", "2026-01-01", " 2026-01", "all", "", nil, 202601, [ "2026-01" ] ].select do |value|
        described_class.parse(value)
      rescue ArgumentError
        false
      end

      expect(accepted).to be_empty
    end
  end

  describe "#to_json" do
    it "is the YYYY-MM string, alone and inside a hash" do
      month = described_class.new(year: 2026, month: 10)

      expect([ month.to_json, { period: month }.to_json ]).to eq([ '"2026-10"', '{"period":"2026-10"}' ])
    end
  end

  describe "#dates" do
    it "runs from the first to the last day of the month" do
      dates = described_class.new(year: 2028, month: 2).dates

      expect([ dates.begin, dates.end ]).to eq([ Date.new(2028, 2, 1), Date.new(2028, 2, 29) ])
    end
  end

  describe ".current" do
    it "is this month in the current time zone, not in UTC" do
      travel_to Time.utc(2026, 10, 31, 23, 30)

      months = [ "UTC", "Europe/Warsaw", "America/Los_Angeles" ].map { |zone| Time.use_zone(zone) { described_class.current.to_s } }

      expect(months).to eq([ "2026-10", "2026-11", "2026-10" ])
    end
  end

  describe "shifting" do
    it "moves back and forward by whole months across a year end" do
      january = described_class.new(year: 2027, month: 1)

      expect([ (january << 1).to_s, (january << 13).to_s, (january >> 11).to_s ]).to eq([ "2026-12", "2025-12", "2027-12" ])
    end
  end

  describe "ordering" do
    it "sorts by calendar, and is never equal to a string" do
      months = [ "2026-01", "2025-12", "2026-10" ].map { described_class.parse(it) }

      expect([ months.max.to_s, months.min.to_s, months.first == "2026-01" ]).to eq([ "2026-10", "2025-12", false ])
    end
  end
end
