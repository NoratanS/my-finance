# Narrows the PR check to the touched specs so it stays fast; the push gate runs everything.
module ChangedSpecs
  # Changes here can break any spec. Paths are relative to the repo root, as git diff prints them.
  FULL_SUITE = %r{
    \A(\.ruby-version\z
    |api/(config/|db/|Gemfile|spec/[^/]+_helper\.rb\z|spec/support/|spec/factories/
         |app/controllers/application_controller\.rb\z|app/controllers/concerns/
         |app/models/application_record\.rb\z))
  }x

  def self.for(paths, exists: ->(path) { File.exist?(path) })
    return :all if paths.any?(FULL_SUITE)

    paths.filter_map { |path| spec_for(path.delete_prefix("api/")) if path.start_with?("api/") }
         .select(&exists).uniq.sort
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
