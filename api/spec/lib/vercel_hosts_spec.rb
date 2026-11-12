require "rails_helper"

RSpec.describe VercelHosts do
  def allows?(hosts, host)
    ActionDispatch::HostAuthorization::Permissions.new(hosts).allows?(host)
  end

  def configured_hosts
    described_class.from(
      "PRODUCTION_HOST" => "finance-prod.vercel.app",
      "PREVIEW_HOST_PROJECT" => "my-finance-v2",
      "PREVIEW_HOST_TEAM" => "chris-projects"
    )
  end

  [
    "finance-prod.vercel.app",
    "finance-prod.vercel.app:443",
    "my-finance-v2-a1b2c3d4e-chris-projects.vercel.app",
    "my-finance-v2-a1b2c3d4e-chris-projects.vercel.app:443"
  ].each do |host|
    it "allows #{host}" do
      expect(allows?(configured_hosts, host)).to be(true)
    end
  end

  [
    "my-finance.vercel.app",
    "my-finance-v2-evil-a1b2c3d4e-chris-projects.vercel.app",
    "my-finance-v2-a1b2c3d4e-evil-chris-projects.vercel.app",
    "evil-my-finance-v2-a1b2c3d4e-chris-projects.vercel.app",
    "my-finance-v2-a1b2c3d4e-chris-projects.vercel.app.evil.com"
  ].each do |host|
    it "rejects #{host}" do
      expect(allows?(configured_hosts, host)).to be(false)
    end
  end

  # Pasted from the dashboard: bin/setup-hosting saved "my-finance-v2-rho.vercel.app/" on the first deploy.
  it "allows the prod domain when it was set as a URL" do
    hosts = described_class.from("PRODUCTION_HOST" => "https://finance-prod.vercel.app/")
    expect(allows?(hosts, "finance-prod.vercel.app")).to be(true)
  end

  # Rails reads an empty host list as "allow every host".
  it "fails closed when nothing is configured" do
    expect(allows?(described_class.from({}), "anything.vercel.app")).to be(false)
  end
end
