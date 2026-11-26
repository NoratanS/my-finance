# One calendar month (GLOSSARY: Period), written "2026-10" in queries and JSON.
Month = Data.define(:year, :month)

# A class body, not the define block, so PATTERN is Month::PATTERN rather than a top-level constant.
class Month
  include Comparable

  # Strict: Date.strptime would also take "2026-1" and "02026-01".
  PATTERN = /\A(\d{4})-(0[1-9]|1[0-2])\z/

  # Raises ArgumentError for anything but a "YYYY-MM" string.
  def self.parse(text)
    match = PATTERN.match(text) if text.is_a?(String)
    raise ArgumentError, "not a YYYY-MM month: #{text.inspect}" unless match

    new(year: match[1].to_i, month: match[2].to_i)
  end

  # This month in Time.zone, so it follows the user's calendar.
  def self.current
    from(Date.current)
  end

  def self.from(date)
    new(year: date.year, month: date.month)
  end

  def first_day
    Date.new(year, month, 1)
  end

  def dates
    first_day.all_month
  end

  def <<(count)
    self.class.from(first_day << count)
  end

  def >>(count)
    self.class.from(first_day >> count)
  end

  # Nil for anything but a Month, so comparing with a string is false rather than an error.
  def <=>(other)
    [ year, month ] <=> [ other.year, other.month ] if other.is_a?(Month)
  end

  def to_s
    format("%04d-%02d", year, month)
  end

  # Data would serialize as {"year":…,"month":…}.
  def as_json(*)
    to_s
  end
end
