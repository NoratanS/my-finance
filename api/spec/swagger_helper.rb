# frozen_string_literal: true

require "rails_helper"

RSpec.configure do |config|
  config.openapi_root = Rails.root.join("swagger").to_s

  # Paths carry the /api prefix, so the server is the app's own origin.
  config.openapi_specs = {
    "v1/openapi.yaml" => {
      openapi: "3.0.3",
      info: { title: "my-finance API", version: "v1" },
      paths: {},
      servers: [ { url: "/" } ]
    }
  }

  config.openapi_format = :yaml
end
