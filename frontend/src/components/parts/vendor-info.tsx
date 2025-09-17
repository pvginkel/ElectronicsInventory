import { cn } from '@/lib/ui';

interface VendorInfoProps {
  seller?: { id: number; name: string } | null;
  sellerLink?: string | null;
  className?: string;
}

export function VendorInfo({ seller, sellerLink, className }: VendorInfoProps) {
  if (!seller) return null;

  const truncatedSeller = seller.name.length > 25 ? seller.name.substring(0, 22) + '...' : seller.name;

  return (
    <span className={cn("inline-flex items-center gap-1 text-sm text-muted-foreground", className)}>
      {sellerLink ? (
        <a
          href={sellerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
          onClick={(e) => e.stopPropagation()}
          title={`${seller.name} - Product page`}
        >
          <span className="text-xs">🏪</span>
          {truncatedSeller}
        </a>
      ) : (
        <>
          <span className="text-xs">🏪</span>
          <span title={seller.name}>{truncatedSeller}</span>
        </>
      )}
    </span>
  );
}