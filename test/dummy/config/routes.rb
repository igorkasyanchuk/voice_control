Rails.application.routes.draw do
  mount VoiceControl::Engine => "/voice_control", as: :voice_control
  root "demo#show"
  resources :users
  resource :settings, only: [:show, :update]
  get "/turbo.js", to: "demo#turbo"
  get "/demo.js", to: "demo#javascript"
  get "/demo.css", to: "demo#stylesheet"
  get "/:page", to: "demo#show", as: :page, constraints: { page: /users|orders|products|reports|settings|activity/ }
end
