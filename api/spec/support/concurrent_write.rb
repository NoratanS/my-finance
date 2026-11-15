# Two connections only see each other's committed rows, so examples using this write for real and clean up.
module ConcurrentWrite
  # The other write (holds, on its own connection) commits only once the block's write is seen waiting, so the order is certain without sleeps.
  def while_another_write(holds:, &write)
    pool = ActiveRecord::Base.connection_pool
    holder = pool.checkout.tap(&:begin_db_transaction)
    holds.call(holder)
    writer = Thread.new { pool.with_connection(&write) }.tap { it.report_on_exception = false }
    wait_until_blocked_by(holder)
    holder.commit_db_transaction
    writer.value
  ensure
    holder.rollback_db_transaction if holder&.transaction_open?
    pool.checkin(holder) if holder
  end

  # A deadline, so a write that never waits fails the example instead of hanging it.
  def wait_until_blocked_by(holder)
    holder_pid = holder.select_value("SELECT pg_backend_pid()")
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
    until ActiveRecord::Base.connection.select_value("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted AND $1 = ANY(pg_blocking_pids(pid)))", "Wait", [ holder_pid ])
      raise "the write never waited for the other one" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline

      Thread.pass
    end
  end
end

RSpec.configure { |config| config.include ConcurrentWrite, type: :model }
