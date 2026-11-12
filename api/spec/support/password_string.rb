# Outside rswag, so the OpenAPI file stays as is. `send_password` makes one request with a params fragment.
RSpec.shared_examples "a password that must be a string" do |send_password|
  it "refuses a missing, blank or non-string password as a malformed request" do
    fragments = [ {}, *[ nil, "", 123456789012, [ "a long and quiet evening" ], { "x" => "a long and quiet evening" } ]
      .map { { password: it } } ]

    refusals = fragments.map do |fragment|
      instance_exec(fragment, &send_password)
      [ response.status, response.parsed_body["title"] ]
    end

    expect(refusals.uniq).to eq([ [ 400, "Send every required field" ] ])
  end
end
