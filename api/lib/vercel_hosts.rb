# The hosts production answers on: the prod domain and this project's preview URLs,
# <project>-<hash>-<team>.vercel.app. bin/setup-hosting sets the three variables in Vercel.
module VercelHosts
  # An empty config.hosts would allow every host, so with nothing set only localhost passes.
  FALLBACK = [ "localhost" ].freeze

  def self.from(env)
    hosts = [ bare_host(env["PRODUCTION_HOST"]), preview_pattern(env["PREVIEW_HOST_PROJECT"], env["PREVIEW_HOST_TEAM"]) ].compact
    hosts.empty? ? FALLBACK : hosts
  end

  # Accepts a pasted URL: drops the scheme and any path.
  def self.bare_host(value)
    value&.sub(%r{\A\w+://}, "")&.split("/")&.first
  end

  # Unanchored on purpose: Rails anchors it and allows an optional port.
  # The hash has no hyphens, so another team's slug can't end in ours.
  def self.preview_pattern(project, team)
    return unless project && team

    /#{Regexp.escape(project)}-[a-z0-9]+-#{Regexp.escape(team)}\.vercel\.app/
  end
end
