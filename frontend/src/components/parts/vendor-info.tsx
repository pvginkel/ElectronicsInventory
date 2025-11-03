import { ExternalLink } from '@/components/ui';

interface VendorInfoProps {
  seller?: { id: number; name: string } | null;
  sellerLink?: string | null;
}

export function VendorInfo({ seller, sellerLink }: VendorInfoProps) {
  if (!seller) return null;

  const truncatedSeller = seller.name.length > 25 ? seller.name.substring(0, 22) + '...' : seller.name;

  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      {sellerLink ? (
        <>
          <span className="text-xs">🏪</span>
          <ExternalLink
            href={sellerLink}
            onClick={(e) => e.stopPropagation()}
            ariaLabel={`${seller.name} - Product page`}
          >
            {truncatedSeller}
          </ExternalLink>
        </>
      ) : (
        <>
          <span className="text-xs">🏪</span>
          <span title={seller.name}>{truncatedSeller}</span>
        </>
      )}
    </span>
  );
}