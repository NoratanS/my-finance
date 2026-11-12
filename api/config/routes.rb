Rails.application.routes.draw do
  # Rails owns /api so dev (Vite proxy) and prod (Vercel rewrite) share one path.
  scope path: "/api" do
    resource :health, only: :show, controller: "health"
    resource :session, only: %i[ show create destroy ]
    resources :invites, only: %i[ index create destroy ]
    resource :signup, only: %i[ show create ]
    resource :password_reset, only: %i[ show update ]
    resources :users, only: :index, shallow: true do
      resources :reset_links, only: :create
    end
  end
end
