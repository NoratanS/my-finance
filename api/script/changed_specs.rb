# Picks the specs a PR's changes touch, so the PR check stays fast; the push gate runs everything.
# Paths come from `git diff --name-only`, relative to the repo root.
module ChangedSpecs
  # Changes here can break any spec.
  FULL_SUITE = %r{\A(config/|db/|Gemfile|spec/[^/]+_helper\.rb\z|spec/support/)}

  # Returns :all, or the spec paths (relative to api/) that exist.
  def self.for(paths, exists: ->(path) { File.exist?(path) })
    api_paths = paths.filter_map { |path| path.delete_prefix("api/") if path.start_with?("api/") }
    return :all if api_paths.any?(FULL_SUITE)

    api_paths.filter_map { |path| spec_for(path) }.select(&exists).uniq.sort
  end

  def self.spec_for(path)
    case path
    when %r{\Aspec/.+_spec\.rb\z} then path
    when %r{\Aapp/controllers/(.+)_controller\.rb\z} then "spec/requests/#{$1}_spec.rb"
    when %r{\Aapp/([^/]+)/(.+)\.rb\z} then "spec/#{$1}/#{$2}_spec.rb"
    when %r{\A(lib|script)/(.+)\.rb\z} then "spec/#{$1}/#{$2}_spec.rb"
    end
  end
  private_class_method :spec_for
end
