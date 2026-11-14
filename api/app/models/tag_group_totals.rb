# A user's tag groups with what each cost, earned and counted over a span (TagTotals' dates).
# A transaction counts once in a group, however many of the group's tags it carries.
class TagGroupTotals
  def initialize(user, dates)
    @user = user
    @dates = dates
  end

  # A–Z the Polish way; an empty group, or one with nothing in the span, comes back at zero.
  # Arel.sql: a fixed collation string, nothing sent.
  def groups
    @user.tag_groups.joins(join_links).group(:id).select("tag_groups.*", *TagTotals.totals_columns(@dates))
      .order(Arel.sql('tag_groups.normalized_name COLLATE "pl-x-icu"'), :id)
  end

  private
    # Raw SQL: ActiveRecord can't LEFT JOIN a subquery. Left, so a group with no tags still comes back.
    def join_links
      "LEFT JOIN (#{links.to_sql}) group_links ON group_links.tag_group_id = tag_groups.id " \
        "LEFT JOIN transactions ON transactions.id = group_links.transaction_id"
    end

    # Each (group, transaction) pair once, not each tag link: summing distinct amounts instead would merge equal ones.
    def links
      TransactionTag.joins(:tag).where(tags: { user_id: @user.id }).where.not(tags: { tag_group_id: nil })
        .distinct.select("tags.tag_group_id", :transaction_id)
    end
end
