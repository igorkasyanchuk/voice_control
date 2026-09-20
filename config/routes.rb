Lazzzy::Engine.routes.draw do
  get "commands", to: "commands#index"
  post "interpret", to: "commands#create"
  post "execute", to: "commands#execute"
  get "widget.js", to: "assets#javascript", as: :javascript
  get "widget.css", to: "assets#stylesheet", as: :stylesheet
end
