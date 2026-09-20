module Lazzzy
  class AssetsController < ActionController::Base
    skip_forgery_protection
    def javascript
      send_asset("widget.js", "text/javascript")
    end

    def stylesheet
      send_asset("widget.css", "text/css")
    end

    private

    def send_asset(name, type)
      path = Engine.root.join("assets", name)
      expires_in Rails.env.development? ? 0.seconds : 1.hour, public: true
      send_data File.binread(path), type: type, disposition: "inline" if stale?(etag: Digest::SHA256.file(path).hexdigest, public: true)
    end
  end
end
