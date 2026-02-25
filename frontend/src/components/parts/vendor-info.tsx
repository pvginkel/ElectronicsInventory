interface SellerLink {
  id: number;
  seller_id: number;
  seller_name: string;
  seller_website: string;
  link: string;
  logo_url: string;
  created_at: string;
}

interface VendorInfoProps {
  sellerLinks?: SellerLink[];
}

/**
 * Renders a row of seller logo icons from the seller_links array.
 * Each logo is clickable (opens the seller link in a new tab).
 * Always renders inside a card context (clickable spans, not anchors).
 */
export function VendorInfo({ sellerLinks }: VendorInfoProps) {
  if (!sellerLinks || sellerLinks.length === 0) return null;

  const handleClick = (e: React.MouseEvent, link: string) => {
    e.stopPropagation();
    e.preventDefault();
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-sm" data-testid="parts.list.card.seller-links">
      {sellerLinks.map((sl) => (
        <span
          key={sl.id}
          role="button"
          tabIndex={0}
          onClick={(e) => handleClick(e, sl.link)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick(e as unknown as React.MouseEvent, sl.link);
            }
          }}
          title={`${sl.seller_name} - Product page (opens in new tab)`}
          aria-label={`${sl.seller_name} - Product page`}
          data-testid="parts.list.card.seller-chip"
        >
          <img
            src={sl.logo_url}
            alt={sl.seller_name}
            className="h-5 w-5 rounded-sm object-contain cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-1 hover:ring-offset-background"
          />
        </span>
      ))}

    </span>
  );
}
