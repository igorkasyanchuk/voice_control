require_relative "test_helper"

class DemoNavigationTest < ActionDispatch::IntegrationTest
  def test_singular_and_plural_page_names_navigate_to_the_same_page
    get "/"
    csrf = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
    headers = { "X-CSRF-Token" => csrf }

    %w[reports users orders products].each do |page|
      [page, page.singularize].each do |name|
        ["open", "go to", "show"].each do |verb|
          transcript = "#{verb} #{name}"
          post "/voice_control/interpret", params: { transcript: transcript, context: {} }, as: :json, headers: headers
          assert_response :success
          result = response.parsed_body
          assert_equal "execute", result["kind"], transcript

          post "/voice_control/execute", params: { ticket: result["ticket"] }, as: :json, headers: headers
          assert_response :success
          assert_equal "/#{page}", response.parsed_body["url"], transcript
        end
      end
    end
  end
end
