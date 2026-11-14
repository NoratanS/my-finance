Rails.application.routes.draw do
  # Rails owns /api so dev (Vite proxy) and prod (Vercel rewrite) share one path.
  scope path: "/api" do
    resource :health, only: :show, controller: "health"
    resource :session, only: %i[ show create destroy ]
    resources :invites, only: %i[ index create destroy ]
    resource :signup, only: %i[ show create ]
    resource :password_reset, only: %i[ show update ]
    resource :password, only: :update
    resource :account, only: :update
    resources :transactions, only: %i[ index create update destroy ]
    resources :transaction_months, only: :index
    resources :tags, only: %i[ index create update ]
    resources :tag_groups, only: %i[ create update destroy ]
    resources :users, only: :index, shallow: true do
      resources :reset_links, only: :create
    end
  end
end
