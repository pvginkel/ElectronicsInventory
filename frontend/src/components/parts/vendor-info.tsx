import { ExternalLinkIcon } from '@/components/icons/ExternalLinkIcon';

interface SellerLink {
  id: number;
  seller_id: number;
  seller_name: string;
  seller_website: string;
  link: string;
  logo_url: string | null;
  created_at: string;
}

interface VendorInfoProps {
  sellerLinks?: SellerLink[];
  /** Maximum number of seller chips/icons to show before overflow indicator. */
  maxVisible?: number;
}

const MAX_VISIBLE_DEFAULT = 3;

/**
 * Renders a row of seller icons/chips from the seller_links array.
 * Each chip is clickable (opens the seller link in a new tab).
 * If logo_url is available, shows the logo; otherwise shows a name chip.
 * Always renders inside a card context (clickable spans, not anchors).
 */
export function VendorInfo({ sellerLinks, maxVisible = MAX_VISIBLE_DEFAULT }: VendorInfoProps) {
  if (!sellerLinks || sellerLinks.length === 0) return null;

  const visible = sellerLinks.slice(0, maxVisible);
  const overflow = sellerLinks.length - maxVisible;

  const handleClick = (e: React.MouseEvent, link: string) => {
    e.stopPropagation();
    e.preventDefault();
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-sm" data-testid="parts.list.card.seller-links">
      {visible.map((sl) => (
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
          {sl.logo_url ? (
            <img
              src={sl.logo_url}
              alt={sl.seller_name}
              className="h-5 w-5 rounded-sm object-contain cursor-pointer hover:opacity-80"
            />
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground cursor-pointer hover:bg-secondary/80">
              {sl.seller_name}
              <ExternalLinkIcon className="inline w-3 h-3 flex-shrink-0" />
            </span>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground">+{overflow}</span>
      )}
    </span>
  );
}
