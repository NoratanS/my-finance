module SignIn
  # Signs in through the API, so the request spec's cookie jar holds a real session.
  def sign_in_as(user, password: "correct horse battery")
    post "/api/session", params: { email: user.email, password: }, as: :json
  end
end

RSpec.configure { |config| config.include SignIn, type: :request }
