require "rails_helper"

RSpec.describe Transaction do
  describe "#retag!" do
    # Two connections only see each other's committed rows, so this group writes for real and cleans up.
    self.use_transactional_tests = false

    after do
      [ TransactionTag, described_class, Tag, User ].each(&:delete_all)
    end

    it "waits while another write holds the row, then replaces the set, so two writes can't reach 6 tags" do
      marta = create(:user)
      tags = create_list(:tag, 6, user: marta)
      transaction = create(:transaction, user: marta, tags: tags.first(4))

      retagged = while_another_write_adds(tags[4], to: transaction) { described_class.find(transaction.id).retag!(tags.values_at(0, 1, 2, 3, 5).map(&:id)) }

      expect([ retagged.tags.count, transaction.tags.reload ]).to eq([ 5, tags.values_at(0, 1, 2, 3, 5) ])
    end

    it "refuses a 6th tag once the other write has committed, and keeps that write's 5" do
      marta = create(:user)
      tags = create_list(:tag, 6, user: marta)
      transaction = create(:transaction, user: marta, tags: tags.first(4))

      refused = while_another_write_adds(tags[4], to: transaction) do
        described_class.find(transaction.id).retag!(tags.map(&:id))
      rescue ActiveRecord::RecordInvalid => invalid
        invalid.record.errors.to_hash
      end

      expect([ refused, transaction.tags.reload ]).to eq([ { tag_ids: [ "can’t be more than 5" ] }, tags.first(5) ])
    end

    # The other write commits only once the block's write is seen waiting, so the order is certain without sleeps.
    def while_another_write_adds(tag, to:, &write)
      pool = ActiveRecord::Base.connection_pool
      holder = pool.checkout
      lock_and_add(holder, tag, to)
      writer = Thread.new { pool.with_connection(&write) }.tap { it.report_on_exception = false }
      wait_until_blocked_by(holder)
      holder.commit_db_transaction
      writer.value
    ensure
      holder.rollback_db_transaction if holder&.transaction_open?
      pool.checkin(holder) if holder
    end

    def lock_and_add(holder, tag, transaction)
      holder.begin_db_transaction
      holder.select_value("SELECT id FROM transactions WHERE id = $1 FOR UPDATE", "Lock", [ transaction.id ])
      holder.exec_query("INSERT INTO transaction_tags (transaction_id, tag_id, created_at) VALUES ($1, $2, now())", "Link", [ transaction.id, tag.id ])
    end

    # A deadline, so a write that never waits fails the example instead of hanging it.
    def wait_until_blocked_by(holder)
      holder_pid = holder.select_value("SELECT pg_backend_pid()")
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
      until ActiveRecord::Base.connection.select_value("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted AND $1 = ANY(pg_blocking_pids(pid)))", "Wait", [ holder_pid ])
        raise "the write never waited for the row lock" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline

        Thread.pass
      end
    end
  end
end
