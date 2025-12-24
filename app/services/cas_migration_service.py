"""CAS migration service for migrating attachments from UUID-based to hash-based S3 keys."""

import logging
from io import BytesIO

from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.part_attachment import PartAttachment
from app.services.base import BaseService
from app.services.s3_service import S3Service

logger = logging.getLogger(__name__)


class CasMigrationService(BaseService):
    """Service for migrating part attachments from UUID-based S3 keys to CAS format."""

    def __init__(self, db: Session, s3_service: S3Service, settings: Settings):
        """Initialize CAS migration service.

        Args:
            db: SQLAlchemy database session
            s3_service: S3 service for file operations
            settings: Application settings
        """
        super().__init__(db)
        self.s3_service = s3_service
        self.settings = settings

    def needs_migration(self) -> bool:
        """Check if database contains attachments needing migration.

        Returns:
            True if any attachments have non-CAS s3_keys.
            Returns False if table doesn't exist (e.g., fresh test database).
        """
        try:
            stmt = select(PartAttachment).where(
                PartAttachment.s3_key.is_not(None),
                ~PartAttachment.s3_key.startswith('cas/')
            ).limit(1)

            result = self.db.scalar(stmt)
            return result is not None
        except OperationalError:
            # Table doesn't exist (e.g., in-memory test database before fixtures run)
            logger.debug("part_attachments table doesn't exist, skipping migration check")
            return False

    def get_unmigrated_count(self) -> int:
        """Get count of attachments that need migration.

        Returns:
            Number of attachments with non-CAS s3_keys
        """
        stmt = select(PartAttachment).where(
            PartAttachment.s3_key.is_not(None),
            ~PartAttachment.s3_key.startswith('cas/')
        )

        result = self.db.scalars(stmt).all()
        return len(result)

    def migrate_attachment(self, attachment: PartAttachment) -> tuple[bool, str]:
        """Migrate a single attachment to CAS format.

        This method:
        1. Downloads content from old S3 key
        2. Computes SHA-256 hash
        3. Uploads to new CAS key (if not already exists)
        4. Updates database s3_key field

        Args:
            attachment: PartAttachment to migrate

        Returns:
            Tuple of (success: bool, message: str)
        """
        old_s3_key = attachment.s3_key

        if not old_s3_key:
            return False, "Attachment has no s3_key"

        if old_s3_key.startswith('cas/'):
            return False, f"Already migrated: {old_s3_key}"

        try:
            # Download content from old S3 key
            content_bytes = self.s3_service.download_file(old_s3_key).read()

            # Compute SHA-256 hash and build new CAS key
            new_s3_key = self.s3_service.generate_cas_key(content_bytes)
            content_hash = new_s3_key.split('/')[-1]

            # Check if CAS object already exists (deduplication)
            if self.s3_service.file_exists(new_s3_key):
                logger.debug(f"CAS object {new_s3_key} already exists, skipping upload")
            else:
                # Upload to new CAS key
                self.s3_service.upload_file(
                    BytesIO(content_bytes),
                    new_s3_key,
                    attachment.content_type
                )
                logger.debug(f"Uploaded {len(content_bytes)} bytes to {new_s3_key}")

            # Update database
            attachment.s3_key = new_s3_key
            self.db.commit()

            return True, f"Migrated to {content_hash}"

        except Exception as e:
            # Roll back transaction for this attachment
            self.db.rollback()
            logger.error(f"Failed to migrate attachment {attachment.id}: {str(e)}")
            return False, f"Error: {str(e)}"

    def migrate_all(self) -> dict[str, int]:
        """Migrate all attachments to CAS format.

        Processes attachments one-by-one with per-row commits.
        Failures are logged and skipped (non-fatal).

        Returns:
            Dictionary with migration statistics:
                - total: total attachments processed
                - migrated: successfully migrated
                - errors: failed migrations
                - skipped: already migrated
        """
        stats = {
            'total': 0,
            'migrated': 0,
            'errors': 0,
            'skipped': 0
        }

        # Loop until no unmigrated attachments remain
        while True:
            # Get next unmigrated attachment
            stmt = select(PartAttachment).where(
                PartAttachment.s3_key.is_not(None),
                ~PartAttachment.s3_key.startswith('cas/')
            ).limit(1)

            attachment = self.db.scalar(stmt)

            if not attachment:
                # No more unmigrated attachments
                break

            stats['total'] += 1

            # Migrate this attachment
            success, message = self.migrate_attachment(attachment)

            if success:
                stats['migrated'] += 1
                logger.info(f"[{stats['total']}] Attachment {attachment.id}: {message}")
            elif "Already migrated" in message:
                stats['skipped'] += 1
                logger.debug(f"[{stats['total']}] Attachment {attachment.id}: {message}")
            else:
                stats['errors'] += 1
                logger.warning(f"[{stats['total']}] Attachment {attachment.id}: {message}")

        return stats

    def cleanup_old_objects(self) -> dict[str, int]:
        """Delete old UUID-based S3 objects after migration.

        This method:
        1. Validates migration is 100% complete
        2. Builds protected CAS key set from database
        3. Lists all S3 objects
        4. Deletes objects not in protected set and not starting with cas/

        Returns:
            Dictionary with cleanup statistics:
                - deleted: number of objects deleted
                - errors: number of deletion failures
                - skipped: number of objects skipped (validation failed)
        """
        stats = {
            'deleted': 0,
            'errors': 0,
            'skipped': 0
        }

        # Validation: ensure migration is complete
        unmigrated_count = self.get_unmigrated_count()
        if unmigrated_count > 0:
            logger.error(f"Cannot run cleanup: {unmigrated_count} attachments not yet migrated")
            stats['skipped'] = unmigrated_count
            return stats

        # Build protected CAS key set
        stmt = select(PartAttachment.s3_key).where(
            PartAttachment.s3_key.is_not(None),
            PartAttachment.s3_key.startswith('cas/')
        ).distinct()

        protected_keys = set(self.db.scalars(stmt).all())
        logger.info(f"Protected {len(protected_keys)} CAS objects from deletion")

        # List all S3 objects (paginated)
        try:
            paginator = self.s3_service.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.settings.S3_BUCKET_NAME)

            for page in pages:
                if 'Contents' not in page:
                    continue

                for obj in page['Contents']:
                    s3_key = obj['Key']

                    # Skip all CAS objects (including orphaned ones - they are immutable and harmless)
                    # Only delete old UUID-based objects not referenced in database
                    if s3_key.startswith('cas/'):
                        continue

                    # Skip protected objects
                    if s3_key in protected_keys:
                        continue

                    # Delete old UUID-based object
                    try:
                        self.s3_service.delete_file(s3_key)
                        stats['deleted'] += 1
                        logger.info(f"Deleted old object: {s3_key}")
                    except Exception as e:
                        stats['errors'] += 1
                        logger.warning(f"Failed to delete {s3_key}: {str(e)}")

        except Exception as e:
            logger.error(f"Failed to list S3 objects: {str(e)}")
            stats['errors'] += 1

        return stats
