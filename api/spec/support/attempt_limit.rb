# Inside a rswag 429 response: the endpoint's body `let` and setup stay in the spec, `attempt` makes one try.
RSpec.shared_examples "an attempt limit" do |attempt|
  schema "$ref" => "#/components/schemas/Problem"
  header "Retry-After", schema: { type: :integer }, description: "Seconds to wait before trying again"

  before { 10.times { instance_exec(&attempt) } }

  run_test! do |response|
    expect(response).to have_attributes(
      headers: include("retry-after" => "180"),
      parsed_body: include("status" => 429, "title" => "Too many attempts. Try again in a few minutes.")
    )
  end
end
