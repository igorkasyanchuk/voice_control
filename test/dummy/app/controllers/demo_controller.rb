class DemoController < ApplicationController
  skip_forgery_protection only: [:javascript, :stylesheet, :turbo]
  def show
    @page = params[:page] || "overview"
  end

  def turbo
    path = File.join(Gem.loaded_specs.fetch("turbo-rails").full_gem_path, "app/assets/javascripts/turbo.js")
    render js: File.read(path)
  end

  def javascript
    render js: File.read(Rails.root.join("demo.js"))
  end

  def stylesheet
    render body: File.read(Rails.root.join("demo.css")), content_type: "text/css"
  end
end
