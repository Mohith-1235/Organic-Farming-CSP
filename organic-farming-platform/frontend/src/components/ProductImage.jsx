import { useState } from 'react';

const categoryIcons = {
  Vegetables: '🥬',
  Fruits: '🍎',
  Pulses: '🌾',
  Grains: '🌾'
};

function isRenderableImage(imageUrl) {
  if (!imageUrl) return false;
  return /^(https?:|data:image\/|\/)/.test(imageUrl);
}

function ProductImage({ product, showImage = true }) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = product?.image_url?.trim();
  const shouldShowImage = showImage && isRenderableImage(imageUrl) && !hasImageError;
  const category = product?.category || 'Produce';

  return (
    <div className="card-image-wrapper">
      {shouldShowImage ? (
        <img
          className="card-image"
          src={imageUrl}
          alt={product?.name || 'Organic product'}
          loading="lazy"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <div className="card-image-fallback">
          <span>{categoryIcons[category] || '🥕'}</span>
        </div>
      )}
      <span className="card-category">{category}</span>
    </div>
  );
}

export default ProductImage;
