Rails.application.routes.draw do
  # Rails owns /api so dev (Vite proxy) and prod (Vercel rewrite) share one path.
  scope path: "/api" do
    resource :health, only: :show, controller: "health"
    resource :session, only: %i[ show create destroy ]
    resources :invites, only: %i[ index create destroy ]
    resources :signups, only: %i[ show create ], param: :token
  end
end
