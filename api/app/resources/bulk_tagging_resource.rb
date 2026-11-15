class BulkTaggingResource
  include Alba::Resource

  many :changed do
    attributes :id, :tag_ids
  end
  attributes :skipped_ids
end
